import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, Defs, RadialGradient, Stop } from "react-native-svg";

function getLemniscatePoint(u: number, t: number, cx: number, cy: number, size: number): [number, number] {
  const morph = Math.sin(t * 0.6);
  const scaleX = size * (1.0 + 0.45 * morph);
  const scaleY = size * (1.0 - 0.28 * morph);
  const globalAngle = t * 0.5; // mai rapid
  const cosG = Math.cos(globalAngle);
  const sinG = Math.sin(globalAngle);
  const denom = 1 + Math.sin(u) * Math.sin(u);
  let px = (scaleX * Math.cos(u)) / denom;
  let py = (scaleY * Math.sin(u) * Math.cos(u)) / denom;
  px *= (1 + 0.08 * Math.sin(u * 3 + t * 1.2));
  py *= (1 + 0.06 * Math.cos(u * 2 + t * 0.9));
  return [px * cosG - py * sinG + cx, px * sinG + py * cosG + cy];
}

function buildPath(t: number, cx: number, cy: number, size: number, segments = 60): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(getLemniscatePoint((i / segments) * Math.PI * 2, t, cx, cy, size));
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d + " Z";
}

// Culori mai vizibile pe fundal negru — portocaliu/auriu/cyan
function liveColor(t: number, alpha = 1): string {
  const r = Math.floor(200 + 55 * Math.sin(t * 0.7));
  const g = Math.floor(120 + 80 * Math.sin(t * 0.5 + 1.0));
  const b = Math.floor(20 + 60 * Math.cos(t * 0.9));
  return `rgba(${r},${g},${b},${alpha})`;
}

function glowColor(t: number): string {
  const r = Math.floor(200 + 55 * Math.sin(t * 0.7));
  const g = Math.floor(120 + 80 * Math.sin(t * 0.5 + 1.0));
  const b = Math.floor(20 + 60 * Math.cos(t * 0.9));
  return `rgba(${r},${g},${b},0.15)`;
}

type Props = { appName?: string };

export default function MiniPauseBanner({ appName = "WorkPayTracker" }: Props) {
  const tickRef = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => {
    let rafId: number;
    let last = 0;
    const animate = (now: number) => {
      if (now - last > 33) { // ~30fps — mai rapid
        tickRef.current += 0.035; // faster animation speed
        setFrame(f => f + 1);
        last = now;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const t = tickRef.current;
  const size = 36;
  const cx = size / 2;
  const cy = size / 2;
  const lemnSize = size * 0.30;

  const mainPath = buildPath(t, cx, cy, lemnSize, 60);
  const glowPath = buildPath(t, cx, cy, lemnSize, 30);

  return (
    <View style={styles.banner}>
      {/* Logo */}
      <View style={styles.logoWrap}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={size / 2 - 1} fill="#FFF7ED" />
          {/* Glow difuz */}
          <Path
            d={glowPath}
            stroke={glowColor(t)}
            strokeWidth={size * 0.28}
            fill="none"
            strokeLinecap="round"
          />
          {/* Main curve — thicker and more visible */}
          <Path
            d={mainPath}
            stroke={liveColor(t, 1)}
            strokeWidth={size * 0.04}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </View>

      {/* App name */}
      <Text style={styles.appName}>{appName}</Text>

      {/* Built by MiniPause */}
      <View style={styles.byWrap}>
        <Text style={styles.byLabel}>by </Text>
        <Text style={[styles.byBrand, { color: liveColor(t, 1) }]}>MiniPause</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#2C1F13",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#4A3725",
  },
  logoWrap: {
    borderRadius: 999,
    overflow: "hidden",
  },
  appName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#FEF3DE",
    letterSpacing: 0.5,
    flex: 1,
    textAlign: "center",
  },
  byWrap: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 90,
    justifyContent: "flex-end",
  },
  byLabel: {
    fontSize: 10,
    color: "rgba(254,243,222,0.8)",
    fontWeight: "600",
  },
  byBrand: {
    fontSize: 10,
    fontWeight: "900",
  },
});
