import React, { useEffect, useRef } from "react";
import { AppState, View, Text, StyleSheet, Animated, Easing, Dimensions } from "react-native";
import MiniPauseLogo from "./MiniPauseLogo";

const { width: W, height: H } = Dimensions.get("window");

type Props = { onDone: () => void; appName?: string };

export default function MiniPauseSplash({ onDone, appName = "WorkPayTracker" }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const appOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const complete = () => {
      if (finished) return;
      finished = true;
      onDone();
    };

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        cleanup();
        complete();
      }
    });

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(appOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start(() => {
        timeoutId = setTimeout(() => {
          Animated.timing(fadeOut, { toValue: 0, duration: 500, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => complete());
        }, 1800);
      });
    });

    return () => {
      cleanup();
      appStateListener.remove();
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <Animated.Text style={[styles.appName, { opacity: appOpacity }]}>{appName}</Animated.Text>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <MiniPauseLogo size={Math.min(W * 0.52, 220)} showText />
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: appOpacity }]}>Your work pay, tracked simply.</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", top: 0, left: 0, width: W, height: H, backgroundColor: "#0F0F0F", alignItems: "center", justifyContent: "center", zIndex: 9999, gap: 24 },
  appName: { fontSize: 26, fontWeight: "900", color: "rgba(255,255,255,0.90)", letterSpacing: 0.5 },
  tagline: { fontSize: 13, fontWeight: "600", color: "rgba(160,160,160,0.65)", letterSpacing: 0.3 },
});