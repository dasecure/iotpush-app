import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
} from "react-native";

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const logoScale = useRef(new Animated.Value(0.2)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Logo entrance animation with bounce
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 40,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // Title fade in with slight delay
    setTimeout(() => {
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 500);

    // Subtitle fade in
    setTimeout(() => {
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 800);

    // Subtle pulse effect for the logo
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.05,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
        { iterations: -1 }
      ).start();
    }, 1200);

    // Transition to app
    setTimeout(() => {
      onFinish();
    }, 2500);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [
                { scale: logoScale },
                { scale: pulseAnimation }
              ],
            },
          ]}
        >
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logo}
          />
          <View style={styles.glow} />
        </Animated.View>

        <Animated.View style={[styles.titleContainer, { opacity: textOpacity }]}>
          <Text style={styles.titlePrefix}>iot</Text>
          <Text style={styles.titleAccent}>push</Text>
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          Push Notifications for IoT
        </Animated.Text>
      </View>

      <Animated.Text style={[styles.footer, { opacity: subtitleOpacity }]}>
        by DaSecure
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#030712",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 32,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 160,
    height: 160,
    borderRadius: 32,
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 20,
  },
  glow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 32,
    backgroundColor: "#f97316",
    opacity: 0.1,
    transform: [{ scale: 1.2 }],
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  titlePrefix: {
    fontSize: 38,
    fontWeight: "300",
    color: "#fff",
    letterSpacing: 2,
  },
  titleAccent: {
    fontSize: 38,
    fontWeight: "800",
    color: "#f97316",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: "#9ca3af",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 60,
    fontSize: 14,
    color: "#374151",
    letterSpacing: 0.5,
  },
});