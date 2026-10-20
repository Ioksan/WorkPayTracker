import React, { useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import MiniPauseSplash from '@/components/minipause/MiniPauseSplash';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider value={DarkTheme}>
      {showSplash ? (
        <MiniPauseSplash onDone={() => setShowSplash(false)} />
      ) : (
        <>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="light" />
        </>
      )}
    </ThemeProvider>
  );
}
