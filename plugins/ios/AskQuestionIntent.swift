//
// "Ask a Question" — the two-way action, and the reason to be in the picker.
//
// The shortcut stops, a human answers on their phone, and the answer comes
// back as this intent's output for the rest of the shortcut to use.
//
// Two clocks, deliberately separate:
//   - `timeout_s` (server): how long the question stays answerable. Fixed at
//     300s. Someone can still answer from the notification after this intent
//     has moved on.
//   - `waitFor` (client): how long this intent blocks. Capped at 170s because
//     Shortcuts kills long-running intents without ceremony; better to return
//     a clean "no answer yet" the shortcut can branch on than to be shot
//     mid-poll.
//
// The wait loop rides the server's own /wait long-poll in 25s slices — the
// same shape as every other client of this API, so the tap-to-continue delay
// is the server's 1s poll granularity, not ours.
//
import AppIntents
import Foundation

@available(iOS 16.0, *)
enum QuestionKind: String, AppEnum {
  case confirm, input

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Question Kind"
  static var caseDisplayRepresentations: [QuestionKind: DisplayRepresentation] = [
    .confirm: DisplayRepresentation(title: "Approve / Reject"),
    .input: DisplayRepresentation(title: "Typed reply"),
  ]
}

@available(iOS 16.0, *)
struct AskQuestionIntent: AppIntent {
  static var title: LocalizedStringResource = "Ask a Question"
  static var description = IntentDescription(
    "Ask a question through iotpush and wait for a human to answer from their phone. Returns the answer.",
    categoryName: "Notifications"
  )

  @Parameter(title: "Question") var question: String
  @Parameter(title: "Topic", description: "The iotpush topic to ask on.")
  var topic: String
  @Parameter(title: "Kind", default: .confirm) var kind: QuestionKind
  @Parameter(title: "Title") var questionTitle: String?
  @Parameter(
    title: "Wait for answer (seconds)",
    description: "How long this action waits before giving up. The question itself stays answerable for 5 minutes.",
    default: 55,
    inclusiveRange: (10, 170)
  )
  var waitFor: Int

  static var parameterSummary: some ParameterSummary {
    Summary("Ask \(\.$question) on \(\.$topic)") {
      \.$kind
      \.$questionTitle
      \.$waitFor
    }
  }

  func perform() async throws -> some IntentResult & ReturnsValue<String> & ProvidesDialog {
    var body: [String: Any] = [
      "topic": topic,
      "question": question,
      "kind": kind.rawValue,
      "timeout_s": 300,
    ]
    if let t = questionTitle, !t.isEmpty { body["title"] = t }

    let created = try await IotpushAPI.call(path: "/api/v1/questions", body: body)
    guard let id = created["question_id"] as? String else {
      throw IotpushError(message: "The question could not be created.")
    }

    let deadline = Date().addingTimeInterval(TimeInterval(waitFor))
    while Date() < deadline {
      let remaining = Int(deadline.timeIntervalSinceNow)
      let slice = min(25, max(1, remaining))
      let state = try await IotpushAPI.call(
        path: "/api/v1/questions/\(id)/wait?timeout=\(slice)",
        method: "GET"
      )
      let status = state["status"] as? String ?? "pending"
      if status == "pending" { continue }

      if status == "answered", let answer = state["answer"] as? [String: Any] {
        // input -> the typed text; confirm -> the button label the human read.
        let value = (answer["text"] as? String)
          ?? (answer["label"] as? String)
          ?? (answer["action_id"] as? String)
          ?? ""
        return .result(value: value, dialog: IntentDialog(stringLiteral: value))
      }
      // cancelled or expired: a real outcome, not an error. Empty output so
      // an If action can branch on "has any value".
      return .result(value: "", dialog: IntentDialog("The question was \(status) before anyone answered."))
    }

    return .result(
      value: "",
      dialog: IntentDialog("No answer yet. The question stays answerable in iotpush for 5 minutes.")
    )
  }
}
