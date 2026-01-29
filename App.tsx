import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { supabase } from "./src/lib/supabase";
import { registerForPushNotifications, addNotificationReceivedListener, addNotificationResponseListener } from "./src/lib/notifications";
import { Topic } from "./src/lib/types";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import TopicsScreen from "./src/screens/TopicsScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import { Session } from "@supabase/supabase-js";

type Screen = "login" | "signup" | "topics" | "messages";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("login");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
      if (s) setScreen("topics");
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        setScreen("topics");
      } else {
        setScreen("login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Register for push notifications when logged in
  useEffect(() => {
    if (session) {
      registerForPushNotifications().then((token) => {
        if (token) {
          setPushToken(token);
          console.log("Push token:", token);
        }
      });

      // Listen for notifications while app is open
      const receivedSub = addNotificationReceivedListener((notification) => {
        console.log("Notification received:", notification);
      });

      const responseSub = addNotificationResponseListener((response) => {
        console.log("Notification tapped:", response);
        // Could navigate to specific topic based on notification data
      });

      return () => {
        receivedSub.remove();
        responseSub.remove();
      };
    }
  }, [session]);

  if (loading) {
    return null; // Could add splash screen
  }

  const handleSelectTopic = (topic: Topic) => {
    setSelectedTopic(topic);
    setScreen("messages");
  };

  switch (screen) {
    case "login":
      return (
        <>
          <StatusBar style="light" />
          <LoginScreen
            onLogin={() => setScreen("topics")}
            onSignup={() => setScreen("signup")}
          />
        </>
      );

    case "signup":
      return (
        <>
          <StatusBar style="light" />
          <SignupScreen
            onSignup={() => setScreen("topics")}
            onLogin={() => setScreen("login")}
          />
        </>
      );

    case "topics":
      return (
        <>
          <StatusBar style="light" />
          <TopicsScreen
            onSelectTopic={handleSelectTopic}
            onLogout={() => setScreen("login")}
          />
        </>
      );

    case "messages":
      return (
        <>
          <StatusBar style="light" />
          {selectedTopic && (
            <MessagesScreen
              topic={selectedTopic}
              onBack={() => setScreen("topics")}
            />
          )}
        </>
      );
  }
}
