//
// The App Shortcuts surface: Siri phrases and the two tiles the Shortcuts app
// shows before anyone builds anything.
//
// iOS 16.4 rather than 16.0 because the AppShortcut initializer that takes
// shortTitle/systemImageName arrived in 16.4. The intents themselves stay at
// 16.0 and appear in the action picker either way; this only gates the
// pre-baked tiles and phrases.
//
import AppIntents

@available(iOS 16.4, *)
struct IotpushShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SendNotificationIntent(),
      phrases: [
        "Send a notification with \(.applicationName)",
        "Send a \(.applicationName) notification",
      ],
      shortTitle: "Send Notification",
      systemImageName: "paperplane.fill"
    )
    AppShortcut(
      intent: AskQuestionIntent(),
      phrases: [
        "Ask a question with \(.applicationName)",
        "Ask someone with \(.applicationName)",
      ],
      shortTitle: "Ask a Question",
      systemImageName: "questionmark.bubble.fill"
    )
  }
}
