import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";
import { signInWithZapQR } from "../lib/zapqrAuth";
import ZapQRButton from "../components/ZapQRButton";
import { signInWithGoogle } from "../lib/googleAuth";
import GoogleButton from "../components/GoogleButton";

interface SignupScreenProps {
  onSignup: () => void;
  onLogin: () => void;
}

export default function SignupScreen({ onSignup, onLogin }: SignupScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [zapqrLoading, setZapqrLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || zapqrLoading || googleLoading;

  // ZapQR has already verified the address, so there is no "check your email"
  // step: the account is created and signed in in one go.
  const handleZapQR = async () => {
    setError("");
    setZapqrLoading(true);
    const result = await signInWithZapQR(email);
    setZapqrLoading(false);
    if (result.status === "signed_in") onSignup();
    else if (result.status === "error") setError(result.message);
  };

  // Same as ZapQR: Google has verified the address, so the account is created
  // (or signed in, if it already exists) in one go.
  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (result.status === "signed_in") onSignup();
    else if (result.status === "error") setError(result.message);
  };

  const handleSignup = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      setLoading(false);

      if (authError) {
        setError(authError.message);
      } else {
        // Show confirmation message — user needs to verify email
        setConfirmationSent(true);
      }
    } catch (e: any) {
      setLoading(false);
      setError(e?.message || "Signup failed. Please try again.");
    }
  };

  if (confirmationSent) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logo}>
            iot<Text style={styles.logoAccent}>push</Text>
          </Text>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmMessage}>
            We sent a verification link to{"\n"}
            <Text style={styles.confirmEmail}>{email}</Text>
          </Text>
          <Text style={styles.confirmHint}>
            Click the link in the email to verify your account, then come back here to log in.
          </Text>
          <TouchableOpacity style={styles.button} onPress={onLogin}>
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={async () => {
              try {
                const { error: resendError } = await supabase.auth.resend({
                  type: "signup",
                  email: email.trim(),
                });
                if (resendError) {
                  Alert.alert("Error", resendError.message);
                } else {
                  Alert.alert("Sent!", "Verification email resent.");
                }
              } catch {
                Alert.alert("Error", "Failed to resend email.");
              }
            }}
          >
            <Text style={styles.linkText}>
              Didn't get it?{" "}
              <Text style={styles.linkAccent}>Resend email</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.logo}>
          iot<Text style={styles.logoAccent}>push</Text>
        </Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <View style={styles.form}>
          {/* Same order and words as iotpush.com/signup: ZapQR, Google, then email. */}
          <ZapQRButton onPress={handleZapQR} loading={zapqrLoading} disabled={busy && !zapqrLoading} />
          <GoogleButton onPress={handleGoogle} loading={googleLoading} disabled={busy && !googleLoading} />
          <Text style={styles.zapqrHint}>One step. No password, no confirmation email.</Text>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or sign up with email</Text>
            <View style={styles.dividerLine} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#6b7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.button}
            onPress={handleSignup}
            disabled={busy}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onLogin} style={styles.linkButton}>
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={styles.linkAccent}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  content: { flex: 1, justifyContent: "center", padding: 24 },
  logo: { fontSize: 40, fontWeight: "bold", color: "#fff", textAlign: "center", marginBottom: 8 },
  logoAccent: { color: "#f97316" },
  subtitle: { fontSize: 16, color: "#9ca3af", textAlign: "center", marginBottom: 40 },
  form: { },
  input: { backgroundColor: "#111827", borderWidth: 1, borderColor: "#374151", borderRadius: 12, padding: 16, fontSize: 16, color: "#fff", marginBottom: 12 },
  button: { backgroundColor: "#f97316", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "600" },
  error: { color: "#ef4444", fontSize: 14, textAlign: "center" },
  linkButton: { marginTop: 16, alignItems: "center" },
  linkText: { color: "#9ca3af", fontSize: 14 },
  linkAccent: { color: "#f97316" },
  zapqrHint: { color: "#6b7280", fontSize: 13, textAlign: "center", marginTop: 8 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#1f2937" },
  dividerText: { color: "#6b7280", fontSize: 13, marginHorizontal: 12 },
  confirmTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
  },
  confirmMessage: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  confirmEmail: {
    color: "#f97316",
    fontWeight: "600",
  },
  confirmHint: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
});
