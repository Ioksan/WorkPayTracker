import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          backgroundColor: "#FFF7ED",
          borderTopWidth: 1,
          borderTopColor: "#F1E3D3",
          height: 82 + insets.bottom,
          paddingTop: 10,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingHorizontal: 8,
        },

        tabBarItemStyle: {
          marginHorizontal: 4,
          marginVertical: 6,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#F1E3D3",
          backgroundColor: "#FFF7ED",
        },

        tabBarActiveBackgroundColor: "#FFE7C2",
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#6B7280",

        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "800",
          marginTop: 2,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="summary"
        options={{
          title: "Summary",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "bar-chart" : "bar-chart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "settings" : "settings-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
