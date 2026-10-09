import React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity } from "react-native";

// Same look and words as the website's GoogleSignInButton: white, full-colour G.
export default function GoogleButton({
  onPress,
  loading = false,
  disabled = false,
  label = "Continue with Google",
}: {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, (disabled || loading) && styles.dim]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator color="#4285F4" style={styles.icon} />
      ) : (
        <Image source={require("../../assets/google-g.png")} style={styles.icon} accessibilityIgnoresInvertColors />
      )}
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    minHeight: 54,
    marginTop: 12,
  },
  dim: { opacity: 0.6 },
  icon: { width: 22, height: 22, marginRight: 12 },
  label: { color: "#1f2937", fontSize: 16, fontWeight: "600" },
});
