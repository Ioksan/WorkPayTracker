import React from "react";
import { Switch, StyleSheet, View } from "react-native";

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
};

export default function PremiumSwitch({ value, onValueChange, disabled }: Props) {
  return (
    <View style={styles.container}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        thumbColor={value ? "#111827" : "#F1E3D3"}
        trackColor={{ false: "#E7E2D9", true: "#FFE7C2" }}
        ios_backgroundColor="#E7E2D9"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
