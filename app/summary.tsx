import React from "react";
import { Redirect } from "expo-router";

export default function SummaryRedirectScreen() {
  return <Redirect href="/(tabs)/summary" />;
}