import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle, Text as SvgText } from "react-native-svg";

function getLemniscatePoint(u: number, t: number, cx: number, cy: number, size: number): [number, number] {
  const morph = Math.sin(t * 0.28);
  const scaleX = size * (1.0 + 0.52 * morph);
  const scaleY = size * (1.0 - 0.32 * morph);
  const globalAngle = t * 0.20;
  const cosG = Math.cos(globalAngle);
  const sinG = Math.sin(globalAngle);
  const denom = 1 + Math.sin(u) * Math.sin(u);
  let px = (scaleX * Math.cos(u)) / denom;
  let py = (scaleY * Math.sin(u) * Math.cos(u)) / denom;
  const warp = 1 + 0.10 * Math.sin(u * 3 + t * 0.85);
  px *= warp;
  py *= (1 + 0.08 * Math.cos(u * 2 + t * 1.05));
  return [px * cosG - py * sinG + cx, px * sinG + py * cosG + cy];
}

function buildPath(t: number, cx: number, cy: number, size: number, segments = 80): string {
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    pts.push(getLemniscatePoint((i / segments) * Math.PI * 2, t, cx, cy, size));
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d + " Z";
}

function buildInnerPath(t: number, cx: number, cy: number, size: number): string {
  const tOff = t + 1.1;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const [px, py] = getLemniscatePoint((i / 60) * Math.PI * 2, tOff, cx, cy, size);
    pts.push([cx + (px - cx) * 0.5, cy + (py - cy) * 0.5]);
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d + " Z";
}

function liveColor(t: number, alpha = 1): string {
  const blue = Math.min(255, Math.floor(155 + 100 * Math.sin(t * 0.45)));
  const green = Math.floor(60 + 80 * Math.cos(t * 0.65));
  return `rgba(0,${green},${blue},${alpha})`;
}

type Props = { size?: number; showText?: boolean; compact?: boolean };

export default function MiniPauseLogo({ size = 120, showText = true, compact = false }: Props) {
  const tickRef = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => {
    let rafId: number;
    let last = 0;
    const animate = (now: number) => {
      if (now - last > 40) {
        tickRef.current += 0.020;
        setFrame(f => f + 1);
        last = now;
      }
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const t = tickRef.current;
  const cx = size / 2;
  const cy = size / 2;
  const lemnSize = size * 0.27;
  const fontSize = compact ? Math.max(7, size * 0.10) : Math.max(10, size * 0.13);
  const labelSize = compact ? Math.max(6, size * 0.08) : Math.max(8, size * 0.10);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={size / 2 - 1} fill="#0F0F0F" />
        <Path d={buildPath(t, cx, cy, lemnSize, 40)} stroke={liveColor(t, 0.06)} strokeWidth={size * 0.22} fill="none" strokeLinecap="round" />
        <Path d={buildPath(t, cx, cy, lemnSize, 80)} stroke={liveColor(t, 0.85)} strokeWidth={size * 0.025} fill="none" strokeLinecap="round" />
        <Path d={buildInnerPath(t, cx, cy, lemnSize)} stroke={liveColor(t + 0.5, 0.45)} strokeWidth={size * 0.012} fill="none" strokeLinecap="round" />
        {showText && <SvgText x={cx} y={cy - fontSize * 0.9} textAnchor="middle" fill="rgba(160,160,160,0.8)" fontSize={labelSize} fontFamily="System">Built by</SvgText>}
        {showText && <SvgText x={cx} y={cy + fontSize * 0.9} textAnchor="middle" fill={liveColor(t, 1)} fontSize={fontSize} fontWeight="bold" fontFamily="System">MiniPause</SvgText>}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 999 },
});