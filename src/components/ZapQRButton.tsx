import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// The ZapQR QR-pixel mark on a 10×10 grid — same geometry as the website's
// button (ZapQRSignInButton.tsx), drawn with Views so no SVG dependency.
const LIME = "#C7F04C";
const INK = "#0B0F14";
const U = 2.2;
const PIXELS: [number, number, number, number, string][] = [
  [1, 1, 3, 3, LIME], [6, 1, 3, 3, LIME], [1, 6, 3, 3, LIME],
  [6, 6, 1, 1, LIME], [8, 6, 1, 1, LIME], [7, 7, 1, 1, LIME], [6, 8, 1, 1, LIME], [8, 8, 1, 1, LIME],
  [2, 2, 1, 1, INK], [7, 2, 1, 1, INK], [2, 7, 1, 1, INK],
];

function ZapQRMark() {
  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PIXELS.map(([x, y, w, h, color], i) => (
        <View
          key={i}
          style={{ position: "absolute", left: x * U, top: y * U, width: w * U, height: h * U, backgroundColor: color }}
        />
      ))}
    </View>
  );
}

export default function ZapQRButton({
  onPress,
  loading = false,
  disabled = false,
  label = "Continue with ZapQR",
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
      {loading ? <ActivityIndicator color={LIME} style={styles.spinner} /> : <ZapQRMark />}
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  dim: { opacity: 0.6 },
  mark: { width: 10 * U, height: 10 * U, borderRadius: 4, backgroundColor: INK, overflow: "hidden", marginRight: 12 },
  spinner: { width: 10 * U, height: 10 * U, marginRight: 12 },
  label: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
