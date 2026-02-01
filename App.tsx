import React, { useEffect, useState, ErrorInfo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: string}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{flex:1,backgroundColor:"#030712",justifyContent:"center",alignItems:"center",padding:20}}>
          <Text style={{color:"#f97316",fontSize:24,fontWeight:"bold",marginBottom:12}}>Something went wrong</Text>
          <Text style={{color:"#9ca3af",textAlign:"center"}}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
import { StatusBar } from "expo-status-bar";
import { supabase } from "./src/lib/supabase";
import { registerForPushNotifications, addNotificationReceivedListener, addNotificationResponseListener } from "./src/lib/notifications";
import { Topic } from "./src/lib/types";
import SplashScreenComponent from "./src/screens/SplashScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import TopicsScreen from "./src/screens/TopicsScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import AllMessagesScreen from "./src/screens/AllMessagesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { Session } from "@supabase/supabase-js";

type Screen = "login" | "signup" | "main" | "messages";
type Tab = "topics" | "inbox" | "settings";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("login");
  const [activeTab, setActiveTab] = useState<Tab>("topics");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        setSession(s);
        setLoading(false);
        if (s) setScreen("main");
      }).catch((err) => {
        console.error("getSession error:", err);
        setLoading(false);
      });
    } catch (err) {
      console.error("getSession sync error:", err);
      setLoading(false);
    }

    let subscription: { unsubscribe: () => void } | undefined;
    try {
      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, s) => {
        setSession(s);
        if (s) {
          setScreen("main");
        } else {
          setScreen("login");
          setActiveTab("topics");
        }
      });
      subscription = sub;
    } catch (err) {
      console.error("onAuthStateChange error:", err);
    }

    return () => {
      try {
        subscription?.unsubscribe();
      } catch (_) {}
    };
  }, []);

  // Register for push notifications when logged in
  useEffect(() => {
    if (session) {
      let receivedSub: { remove: () => void } | undefined;
      let responseSub: { remove: () => void } | undefined;

      try {
        registerForPushNotifications().then((token) => {
          if (token) {
            setPushToken(token);
            console.log("Push token:", token);
          }
        }).catch((err) => {
          console.log("Push registration failed:", err);
        });
      } catch (err) {
        console.log("Push registration sync error:", err);
      }

      try {
        receivedSub = addNotificationReceivedListener((notification) => {
          console.log("Notification received:", notification);
        });
      } catch (err) {
        console.log("Notification received listener error:", err);
      }

      try {
        responseSub = addNotificationResponseListener((response) => {
          console.log("Notification tapped:", response);
        });
      } catch (err) {
        console.log("Notification response listener error:", err);
      }

      return () => {
        try { receivedSub?.remove(); } catch (_) {}
        try { responseSub?.remove(); } catch (_) {}
      };
    }
  }, [session]);

  // Splash screen
  if (showSplash) {
    return (
      <ErrorBoundary>
        <StatusBar style="light" />
        <SplashScreenComponent onFinish={() => setShowSplash(false)} />
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <ErrorBoundary>
        <View style={styles.loadingContainer}>
          <StatusBar style="light" />
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      </ErrorBoundary>
    );
  }

  const handleSelectTopic = (topic: Topic) => {
    setSelectedTopic(topic);
    setScreen("messages");
  };

  const handleLogout = () => {
    setScreen("login");
    setActiveTab("topics");
  };

  // Auth screens
  if (screen === "login") {
    return (
      <ErrorBoundary>
        <StatusBar style="light" />
        <LoginScreen
          onLogin={() => setScreen("main")}
          onSignup={() => setScreen("signup")}
        />
      </ErrorBoundary>
    );
  }

  if (screen === "signup") {
    return (
      <ErrorBoundary>
        <StatusBar style="light" />
        <SignupScreen
          onSignup={() => setScreen("main")}
          onLogin={() => setScreen("login")}
        />
      </ErrorBoundary>
    );
  }

  // Messages detail screen (on top of tabs)
  if (screen === "messages" && selectedTopic) {
    return (
      <ErrorBoundary>
        <StatusBar style="light" />
        <MessagesScreen
          topic={selectedTopic}
          onBack={() => setScreen("main")}
        />
      </ErrorBoundary>
    );
  }

  // Main app with tab bar
  return (
    <ErrorBoundary>
    <View style={styles.mainContainer}>
      <StatusBar style="light" />

      {/* Tab content */}
      <View style={styles.tabContent}>
        {activeTab === "topics" && (
          <TopicsScreen onSelectTopic={handleSelectTopic} pushToken={pushToken} />
        )}
        {activeTab === "inbox" && (
          <AllMessagesScreen onSelectTopic={handleSelectTopic} />
        )}
        {activeTab === "settings" && (
          <SettingsScreen
            userEmail={session?.user?.email ?? null}
            pushToken={pushToken}
            onLogout={handleLogout}
          />
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TabButton
          icon="📋"
          label="Topics"
          active={activeTab === "topics"}
          onPress={() => setActiveTab("topics")}
        />
        <TabButton
          icon="📬"
          label="Inbox"
          active={activeTab === "inbox"}
          onPress={() => setActiveTab("inbox")}
        />
        <TabButton
          icon="⚙️"
          label="Settings"
          active={activeTab === "settings"}
          onPress={() => setActiveTab("settings")}
        />
      </View>
    </View>
    </ErrorBoundary>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.tabIcon}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {active && <View style={styles.tabIndicator} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  mainContainer: {
    flex: 1,
    backgroundColor: "#030712",
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#111827",
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
    paddingBottom: 28, // safe area for home indicator
    paddingTop: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "#f97316",
  },
  tabIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#f97316",
    marginTop: 3,
  },
});
