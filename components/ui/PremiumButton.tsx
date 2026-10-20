import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { D } from "../../constants/theme";

type Variant = "primary" | "secondary" | "danger" | "ghost";

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
};

export default function PremiumButton({
  label, onPress, variant = "primary",
  disabled, loading, icon, fullWidth = true,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, tension: 150, friction: 8 }),
      Animated.timing(opacity, { toValue: 0.85, duration: 80, useNativeDriver: true }),
    ]).start();
  }

  function handlePressOut() {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 150, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }

  const variantStyles: Record<Variant, any> = {
    primary: {
      container: styles.primaryContainer,
      text: styles.primaryText,
    },
    secondary: {
      container: styles.secondaryContainer,
      text: styles.secondaryText,
    },
    danger: {
      container: styles.dangerContainer,
      text: styles.dangerText,
    },
    ghost: {
      container: styles.ghostContainer,
      text: styles.ghostText,
    },
  };

  const vs = variantStyles[variant];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={fullWidth ? { width: "100%" } : undefined}
    >
      <Animated.View style={[
        styles.base,
        vs.container,
        fullWidth && { width: "100%" },
        (disabled || loading) && styles.disabledBase,
        { transform: [{ scale }], opacity },
      ]}>
        {loading ? (
          <ActivityIndicator color={variant === "primary" ? "#0D0F14" : D.goldLight} size="small" />
        ) : (
          <>
            {icon && <View style={styles.iconWrap}>{icon}</View>}
            <Text style={[styles.baseText, vs.text]}>{label}</Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  baseText: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBase: {
    opacity: 0.45,
  },

  // Primary — gold gradient look
  primaryContainer: {
    backgroundColor: D.gold,
    shadowColor: D.goldGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryText: {
    color: "#0D0F14",
  },

  // Secondary — dark glass
  secondaryContainer: {
    backgroundColor: D.bgCard2,
    borderWidth: 1,
    borderColor: D.borderGold,
  },
  secondaryText: {
    color: D.goldLight,
  },

  // Danger — red
  dangerContainer: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderWidth: 1,
    borderColor: D.red,
  },
  dangerText: {
    color: D.red,
  },

  // Ghost — transparent
  ghostContainer: {
    backgroundColor: D.glass,
    borderWidth: 1,
    borderColor: D.glassBorder,
  },
  ghostText: {
    color: D.textSecondary,
  },
});
