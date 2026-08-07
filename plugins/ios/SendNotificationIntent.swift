//
// "Send Notification" — the one-way action.
//
// Returns the subscriber count as its output so a shortcut can branch on
// whether anyone was actually reached, which the gallery's own templates do.
//
import AppIntents
import Foundation

@available(iOS 16.0, *)
enum NotificationPriority: String, AppEnum {
  case low, normal, high, urgent

  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Priority"
  static var caseDisplayRepresentations: [NotificationPriority: DisplayRepresentation] = [
    .low: "Low",
    .normal: "Normal",
    .high: "High",
    .urgent: "Urgent",
  ]
}

@available(iOS 16.0, *)
struct SendNotificationIntent: AppIntent {
  static var title: LocalizedStringResource = "Send Notification"
  static var description = IntentDescription(
    "Send a push notification to an iotpush topic.",
    categoryName: "Notifications"
  )

  @Parameter(title: "Message") var message: String
  @Parameter(title: "Topic", description: "The iotpush topic to send to.")
  var topic: String
  @Parameter(title: "Title") var notificationTitle: String?
  @Parameter(title: "Priority", default: .normal) var priority: NotificationPriority

  static var parameterSummary: some ParameterSummary {
    Summary("Send \(\.$message) to \(\.$topic)") {
      \.$notificationTitle
      \.$priority
    }
  }

  func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog {
    let encodedTopic = topic.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? topic
    var body: [String: Any] = [
      "message": message,
      "priority": priority.rawValue,
    ]
    if let t = notificationTitle, !t.isEmpty { body["title"] = t }

    let result = try await IotpushAPI.call(path: "/api/push/\(encodedTopic)", body: body)
    let subscribers = result["subscribers"] as? Int ?? 0
    return .result(
      value: subscribers,
      dialog: IntentDialog("Sent to \(subscribers) device\(subscribers == 1 ? "" : "s").")
    )
  }
}
