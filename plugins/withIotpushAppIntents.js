/**
 * Adds the App Intents layer to the generated iOS project.
 *
 * The Swift sources live in plugins/ios/ and are copied into the app target at
 * prebuild time. They go into the MAIN target on purpose: intents in the app
 * target share the app's sandbox and Keychain directly, so there is no App
 * Group, no extension target, and no entitlement to manage. An App Intents
 * *extension* buys faster cold-start at the cost of all three — not worth it
 * for two network-bound intents.
 *
 * Order matters and is guaranteed by expo: dangerous mods run before base
 * mods, so the files exist on disk before withXcodeProject wires them in.
 */
const { withXcodeProject, withDangerousMod, IOSConfig } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCES = [
  "IotpushCredentials.swift",
  "IotpushAPI.swift",
  "SendNotificationIntent.swift",
  "AskQuestionIntent.swift",
  "IotpushShortcuts.swift",
  "IotpushShortcutsBridge.swift",
  "IotpushShortcutsBridge.m",
];

function withCopiedSources(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const projectName = config.modRequest.projectName;
      const src = path.join(config.modRequest.projectRoot, "plugins", "ios");
      const dest = path.join(config.modRequest.platformProjectRoot, projectName);

      for (const file of SOURCES) {
        fs.copyFileSync(path.join(src, file), path.join(dest, file));
      }

      // The Swift bridge uses RCTPromiseResolveBlock, which reaches Swift
      // through the bridging header. Expo generates the header; we append the
      // one import it needs, idempotently.
      const header = path.join(dest, `${projectName}-Bridging-Header.h`);
      if (fs.existsSync(header)) {
        const content = fs.readFileSync(header, "utf8");
        if (!content.includes("RCTBridgeModule.h")) {
          const sep = content.endsWith("\n") ? "" : "\n";
          fs.writeFileSync(header, content + sep + '#import <React/RCTBridgeModule.h>\n');
        }
      } else {
        throw new Error(
          `[withIotpushAppIntents] Bridging header not found at ${header}. ` +
          "The Swift RN bridge cannot compile without it."
        );
      }
      return config;
    },
  ]);
}

function withProjectSources(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;
    for (const file of SOURCES) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: path.join(projectName, file),
        groupName: projectName,
        project,
      });
    }
    return config;
  });
}

module.exports = function withIotpushAppIntents(config) {
  return withProjectSources(withCopiedSources(config));
};
