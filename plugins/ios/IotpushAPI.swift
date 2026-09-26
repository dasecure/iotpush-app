//
// Minimal client for the two endpoints the intents call.
//
// Errors carry user-facing text because whatever this throws is exactly what
// Shortcuts shows the person — there is no other UI. The server's own error
// strings are already written for humans (401/402/409 all name the fix), so
// they are surfaced verbatim when present.
//
import Foundation

struct IotpushError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

enum IotpushAPI {
  private static let base = "https://www.iotpush.com"

  static func call(
    path: String,
    method: String = "POST",
    body: [String: Any]? = nil
  ) async throws -> [String: Any] {
    guard let key = IotpushCredentials.apiKey() else {
      throw IotpushError(message:
        "Apple Shortcuts is not enabled. Open the iotpush app, go to Settings, and turn on Apple Shortcuts.")
    }
    guard let url = URL(string: base + path) else {
      throw IotpushError(message: "Bad request path.")
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 35 // must sit above the 25s long-poll slice
    request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
    if let body = body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }

    let (data, response): (Data, URLResponse)
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw IotpushError(message: "Could not reach iotpush. Check your connection and try again.")
    }

    let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]

    if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
      let serverMessage = json["error"] as? String
      throw IotpushError(message: serverMessage ?? "iotpush returned an error (\(http.statusCode)).")
    }
    return json
  }
}
