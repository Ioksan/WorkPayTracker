import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Rect, Line, Polyline, Circle, Text as SvgText } from "react-native-svg";

import MiniPauseBanner from "../../components/minipause/MiniPauseBanner";

import { loadDays, DayMap } from "../../src/storage/calendarStorage";
import { loadSettings, AppSettings, DEFAULT_SETTINGS } from "../../src/storage/settingsStorage";
import {
  entriesForCycle,
  calcCycleTotals,
  estimateNetFromGrossWithSettings,
  moneyGBP,
  getCycleStartForDate,
  getCycleEndExclusive,
  getPaydayForCycleStart,
} from "../../src/lib/pay";

const BG_WARM = "#FFFBF2";
const CARD_WARM = "#FFF4E6";
const BORDER_WARM = "#F1E3D3";

function shiftISODate(dateISO: string, days: number) {
  const [y, m, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isoToDisplay(dateISO: string) {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-");
  return `${d}-${m}-${y}`;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const safeH = h + Math.floor(m / 60);
  const safeM = m % 60;
  return `${safeH}:${String(safeM).padStart(2, "0")} (${hours.toFixed(2)}h)`;
}

// Financial year runs 1 April to 31 March.
function fiscalYearStartISO(refISO: string) {
  const [y, m] = refISO.split("-").map((x) => parseInt(x, 10));
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-04-01`;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

function CycleButton({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: () => void;
  variant: "gray" | "primary";
}) {
  const [pressed, setPressed] = useState(false);
  const baseStyle = variant === "primary" ? styles.cycleBtnPrimary : styles.cycleBtnGray;
  const pressedStyle = variant === "primary" ? styles.cycleBtnPrimaryPressed : styles.cycleBtnGrayPressed;
  const textStyle = variant === "primary" ? styles.cycleBtnPrimaryText : styles.cycleBtnGrayText;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.cycleBtn, baseStyle, pressed && pressedStyle, pressed && styles.cycleBtnPressed]}
    >
      <Text style={[styles.cycleBtnText, textStyle, pressed && styles.cycleBtnTextPressed]}>{label}</Text>
    </Pressable>
  );
}

type CyclePoint = { index: number; net: number; basicHours: number; overtimeHours: number };

// Single-series vertical bar chart.
function BarChart({ width, data, color, valueFmt }: {
  width: number; data: CyclePoint[]; color: string; valueFmt: (n: number) => string;
}) {
  const height = 180;
  const padL = 8, padR = 8, padT = 14, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(slot * 0.6, 22);
  const max = Math.max(1, ...data.map((d) => d.net));
  const baseY = padT + plotH;

  return (
    <Svg width={width} height={height}>
      <Line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke={BORDER_WARM} strokeWidth={1} />
      {data.map((d, i) => {
        const x = padL + slot * i + (slot - barW) / 2;
        const h = (d.net / max) * plotH;
        const y = baseY - h;
        return (
          <React.Fragment key={i}>
            {d.net > 0 ? <Rect x={x} y={y} width={barW} height={h} rx={3} fill={color} /> : null}
            <SvgText x={x + barW / 2} y={height - 8} fontSize={9} fill="#5A6070" textAnchor="middle">
              {String(d.index)}
            </SvgText>
            {d.net > 0 ? (
              <SvgText x={x + barW / 2} y={y - 3} fontSize={8} fill="#374151" textAnchor="middle">
                {valueFmt(d.net)}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// Grouped bar chart: basic vs overtime hours per cycle.
function GroupedHoursChart({ width, data }: { width: number; data: CyclePoint[] }) {
  const height = 180;
  const padL = 8, padR = 8, padT = 14, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = data.length || 1;
  const slot = plotW / n;
  const barW = Math.min(slot * 0.28, 10);
  const max = Math.max(1, ...data.map((d) => Math.max(d.basicHours, d.overtimeHours)));
  const baseY = padT + plotH;
  const basicColor = "#3F7D58";
  const otColor = "#C2703D";

  return (
    <Svg width={width} height={height}>
      <Line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke={BORDER_WARM} strokeWidth={1} />
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const hB = (d.basicHours / max) * plotH;
        const hO = (d.overtimeHours / max) * plotH;
        return (
          <React.Fragment key={i}>
            {d.basicHours > 0 ? <Rect x={cx - barW - 1} y={baseY - hB} width={barW} height={hB} rx={2} fill={basicColor} /> : null}
            {d.overtimeHours > 0 ? <Rect x={cx + 1} y={baseY - hO} width={barW} height={hO} rx={2} fill={otColor} /> : null}
            <SvgText x={cx} y={height - 8} fontSize={9} fill="#5A6070" textAnchor="middle">{String(d.index)}</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// Cumulative net across the fiscal year (line).
function CumulativeLineChart({ width, data }: { width: number; data: CyclePoint[] }) {
  const height = 180;
  const padL = 8, padR = 8, padT = 14, padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = data.length || 1;
  const baseY = padT + plotH;

  let running = 0;
  const cum = data.map((d) => (running += d.net));
  const max = Math.max(1, ...cum);
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const points = cum.map((c, i) => {
    const x = padL + stepX * i;
    const y = baseY - (c / max) * plotH;
    return { x, y, c, index: data[i].index };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <Svg width={width} height={height}>
      <Line x1={padL} y1={baseY} x2={padL + plotW} y2={baseY} stroke={BORDER_WARM} strokeWidth={1} />
      <Polyline points={polyline} fill="none" stroke="#2F6F4F" strokeWidth={2} />
      {points.map((p, i) => (
        <React.Fragment key={i}>
          <Circle cx={p.x} cy={p.y} r={2.5} fill="#2F6F4F" />
          <SvgText x={p.x} y={height - 8} fontSize={9} fill="#5A6070" textAnchor="middle">{String(p.index)}</SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

export default function SummaryTab() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(240, width - 48);

  const [dayMap, setDayMap] = useState<DayMap>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeCycleStart, setActiveCycleStart] = useState(DEFAULT_SETTINGS.cycleFirstDate);

  const reload = useCallback(async () => {
    const [days, loadedSettings] = await Promise.all([loadDays(), loadSettings()]);
    setDayMap(days);
    setSettings(loadedSettings);
    setActiveCycleStart(getCycleStartForDate(todayISO(), loadedSettings));
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const allEntries = useMemo(
    () => Object.keys(dayMap).sort().map((k) => dayMap[k]).filter(Boolean),
    [dayMap]
  );

  const cycleEntries = useMemo(
    () => entriesForCycle(dayMap, activeCycleStart, settings),
    [dayMap, activeCycleStart, settings]
  );

  const totals = useMemo(
    () => calcCycleTotals(cycleEntries, settings, allEntries),
    [cycleEntries, settings, allEntries]
  );

  const net = useMemo(
    () => estimateNetFromGrossWithSettings(totals.gross, settings),
    [totals.gross, settings]
  );

  const cycleEndExclusive = useMemo(
    () => getCycleEndExclusive(activeCycleStart, settings),
    [activeCycleStart, settings]
  );
  const cycleLastWorkingDate = useMemo(() => shiftISODate(cycleEndExclusive, -1), [cycleEndExclusive]);
  const paydayISO = useMemo(() => getPaydayForCycleStart(activeCycleStart, settings), [activeCycleStart, settings]);
  const currentCycleStart = useMemo(() => getCycleStartForDate(todayISO(), settings), [settings]);

  const basicWorkedHours = Math.max(0, totals.shiftHours - totals.overtimeHours);
  const holidayOnlyHours = Math.max(0, totals.holidayHours - totals.lieuHours);

  // Fiscal-year cycles (up to 13) for the charts.
  const fiscalData = useMemo<CyclePoint[]>(() => {
    const fyStart = fiscalYearStartISO(todayISO());
    const points: CyclePoint[] = [];
    let cur = getCycleStartForDate(fyStart, settings);
    let guard = 0;
    while (guard < 13) {
      const entries = entriesForCycle(dayMap, cur, settings);
      const t = calcCycleTotals(entries, settings, allEntries);
      const n = estimateNetFromGrossWithSettings(t.gross, settings);
      points.push({
        index: guard + 1,
        net: n.net,
        basicHours: Math.max(0, t.shiftHours - t.overtimeHours),
        overtimeHours: t.overtimeHours,
      });
      cur = getCycleEndExclusive(cur, settings);
      guard++;
    }
    return points;
  }, [dayMap, settings, allEntries]);

  function getCycleSpanDays() {
    const start = new Date(`${activeCycleStart}T00:00:00`);
    const endExclusive = new Date(`${cycleEndExclusive}T00:00:00`);
    const span = Math.floor((endExclusive.getTime() - start.getTime()) / 86400000);
    return Math.max(1, span);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <MiniPauseBanner appName="WorkPayTracker" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Summary</Text>

        <Card title="Cycle">
          <Row label="Cycle start" value={isoToDisplay(activeCycleStart)} strong />
          <Row label="Cycle closes" value={isoToDisplay(cycleLastWorkingDate)} strong />
          <Row label="Payday" value={isoToDisplay(paydayISO)} strong />
          <View style={styles.cycleButtons}>
            <CycleButton label="◀ Previous" variant="gray" onPress={() => setActiveCycleStart((v) => shiftISODate(v, -getCycleSpanDays()))} />
            <CycleButton label="Current" variant="primary" onPress={() => setActiveCycleStart(currentCycleStart)} />
            <CycleButton label="Next ▶" variant="gray" onPress={() => setActiveCycleStart((v) => shiftISODate(v, getCycleSpanDays()))} />
          </View>
        </Card>

        <Card title="Gross breakdown">
          <Row label="Hourly pay" value={moneyGBP(totals.basicPay)} />
          <Row label="Overtime" value={moneyGBP(totals.overtimePay)} />
          <Row label="Night premium" value={moneyGBP(totals.nightPay)} />
          <Row label="Saturday premium" value={moneyGBP(totals.saturdayPay)} />
          <Row label="Sunday premium" value={moneyGBP(totals.sundayPay)} />
          <Row label="Holiday" value={moneyGBP(totals.holidayPay)} />
          <Row label="Lieu" value={moneyGBP(totals.lieuPay)} />
          <Row label="Sick" value={moneyGBP(0)} />
          {totals.nightOutPay > 0 ? <Row label="Night out allowance" value={moneyGBP(totals.nightOutPay)} /> : null}
          <Row label="Gross (before tax)" value={moneyGBP(totals.gross)} strong />
        </Card>

        <Card title="Net">
          <Row label="Gross" value={moneyGBP(net.gross)} />
          <Row label="Income tax (PAYE)" value={`- ${moneyGBP(net.incomeTax)}`} />
          <Row label="National Insurance" value={`- ${moneyGBP(net.nationalInsurance)}`} />
          <Row label="Pension" value={`- ${moneyGBP(net.pension)}`} />
          <Row label="Union" value={`- ${moneyGBP(net.union)}`} />
          <Row label="Net" value={moneyGBP(net.net)} strong />
        </Card>

        <Card title="Hours breakdown">
          <Row label="Basic hours" value={formatHours(basicWorkedHours)} />
          <Row label="Overtime hours (1.5x)" value={formatHours(totals.overtimeHours)} />
          <Row label="Shift hours total" value={formatHours(totals.shiftHours)} />
          <Row label="Night hours" value={formatHours(totals.nightHours)} />
          <Row label="Saturday hours" value={formatHours(totals.saturdayHours)} />
          <Row label="Sunday hours" value={formatHours(totals.sundayHours)} />
          <Row label="Holiday hours" value={formatHours(holidayOnlyHours)} />
          <Row label="Lieu hours" value={formatHours(totals.lieuHours)} />
          <Row label="Sick days" value={String(totals.sickDays)} />
          <Row label="Paid hours total" value={formatHours(totals.paidHours)} strong />
        </Card>

        <Card title="Estimated net per cycle">
          <BarChart width={chartWidth} data={fiscalData} color="#2F6F4F" valueFmt={(n) => `£${Math.round(n)}`} />
          <Text style={styles.chartNote}>Financial year, cycles 1–13 (1 Apr – 31 Mar). Estimated net — PAYE and NI are approximate.</Text>
        </Card>

        <Card title="Hours per cycle">
          <GroupedHoursChart width={chartWidth} data={fiscalData} />
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: "#3F7D58" }]} />
            <Text style={styles.legendText}>Basic</Text>
            <View style={[styles.legendDot, { backgroundColor: "#C2703D", marginLeft: 14 }]} />
            <Text style={styles.legendText}>Overtime</Text>
          </View>
          <Text style={styles.chartNote}>Basic vs overtime worked hours per cycle.</Text>
        </Card>

        <Card title="Cumulative net (financial year)">
          <CumulativeLineChart width={chartWidth} data={fiscalData} />
          <Text style={styles.chartNote}>Running total of estimated net across the financial year.</Text>
        </Card>

        <Text style={styles.small}>
          Net pay is an estimate. PAYE and NI depend on HMRC setup and year-to-date pay; pension and union are exact.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_WARM },
  screen: { flex: 1, backgroundColor: BG_WARM },
  container: { padding: 12, backgroundColor: BG_WARM },
  title: { fontSize: 22, fontWeight: "900", color: "#111827" },
  card: { marginTop: 12, borderWidth: 1, borderColor: BORDER_WARM, borderRadius: 14, padding: 12, backgroundColor: CARD_WARM },
  cardTitle: { fontWeight: "900", color: "#111827", marginBottom: 10, fontSize: 16 },

  cycleButtons: { marginTop: 10, gap: 8, flexDirection: "row" },
  cycleBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  cycleBtnGray: { backgroundColor: "#E5E7EB", borderColor: "#D1D5DB" },
  cycleBtnGrayPressed: { backgroundColor: "#D1D5DB", borderColor: "#9CA3AF" },
  cycleBtnGrayText: { color: "#111827" },
  cycleBtnPrimary: { backgroundColor: "#111827", borderColor: "#111827" },
  cycleBtnPrimaryPressed: { backgroundColor: "#374151", borderColor: "#6B7280" },
  cycleBtnPrimaryText: { color: "#FFFBF2" },
  cycleBtnPressed: { transform: [{ scale: 0.95 }], opacity: 0.8 },
  cycleBtnText: { fontWeight: "900", fontSize: 13 },
  cycleBtnTextPressed: { opacity: 0.9 },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 6 },
  rowLabel: { flex: 1, color: "#4B5563", fontWeight: "800" },
  rowValue: { color: "#374151", fontWeight: "800", textAlign: "right", flexShrink: 1 },
  rowLabelStrong: { color: "#111827", fontWeight: "900" },
  rowValueStrong: { color: "#111827", fontWeight: "900" },

  chartNote: { marginTop: 8, color: "#5A6070", fontWeight: "700", fontSize: 11 },
  legendRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 3, marginRight: 6 },
  legendText: { color: "#4B5563", fontWeight: "800", fontSize: 12 },

  small: { marginTop: 12, color: "#5A6070", fontWeight: "800", fontSize: 12 },
});
