import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  PanResponder,
  Animated,
  useWindowDimensions,
  ScrollView,
} from "react-native";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import MiniPauseBanner from "../../components/minipause/MiniPauseBanner";
import { loadDays, DayEntry, DayMap } from "../../src/storage/calendarStorage";
import {
  calcCycleTotals,
  calcDayGrossWithSettings,
  calcDayPaidHours,
  entriesForCycle,
  estimateNetFromGrossWithSettings,
  getCycleStartForDate,
  getPaydayForCycleStart,
  getPlannedPatternTokenForDate,
  getWorkPatternCycleIndex,
  getAdjustedOvertimeThreshold,
  getCycleBoundsForStart,
  calcShiftHours,
} from "../../src/lib/pay";
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from "../../src/storage/settingsStorage";

const BG_WARM = "#FFFBF2";
const CARD_WARM = "#FFF4E6";
const BORDER_WARM = "#F1E3D3";
const SWIPE_THRESHOLD = 60;
const ANIMATION_DURATION = 220;

type SwipeDirection = "next" | "prev" | null;

function dayColor(kind: string) {
  switch (kind) {
    case "worked":
      return { bg: "#DCFCE7", border: "#22C55E", text: "#065F46" };

    case "holiday":
      return { bg: "#FEF3C7", border: "#F59E0B", text: "#92400E" };

    case "lieu":
      return { bg: "#E0F2FE", border: "#0284C7", text: "#075985" };

    case "sick":
      return { bg: "#FEE2E2", border: "#DC2626", text: "#991B1B" };

    case "dayoff":
      return { bg: "#EAE3D8", border: "#B5A892", text: "#5A4F3D" };

    case "off":
    default:
      return { bg: "#FFFFFF", border: "#E5E7EB", text: "#111827" };
  }
}

function sortByDateAsc(entries: DayEntry[]) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function isoToEU(dateISO: string) {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-");
  return `${d}-${m}-${y}`;
}

function getPaydayISOForDate(dateISO: string, settings: AppSettings) {
  const cycleStart = getCycleStartForDate(dateISO, settings);
  return getPaydayForCycleStart(cycleStart, settings);
}

function getMonthDays(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const arr: Date[] = [];
  let cur = start;
  while (cur <= end) {
    arr.push(cur);
    cur = addDays(cur, 1);
  }
  return arr;
}

// Group days into weeks of 7. Rendering explicit rows (instead of a single
// flex-wrap grid) lets React Native measure the aspectRatio cell height
// correctly, so the last week is never clipped under the legend.
function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

function buildPaydayDateSet(
  visibleDates: string[],
  settings: AppSettings
) {
  const paydayDates = new Set<string>();
  for (const dateISO of visibleDates) {
    paydayDates.add(getPaydayISOForDate(dateISO, settings));
  }
  return paydayDates;
}

function buildExtraShiftDateSet(
  dayMap: DayMap,
  visibleDates: string[]
) {
  const extraShiftDates = new Set<string>();

  for (const dateISO of visibleDates) {
    const entry = dayMap[dateISO];
    if (
      entry &&
      entry.data.type === "shift" &&
      entry.data.shift?.extraShift
    ) {
      extraShiftDates.add(dateISO);
    }
  }

  return extraShiftDates;
}

function getDisplayKind(entry?: DayEntry | null, plannedToken?: string | null) {
  if (entry) {
    if (entry.data.type === "shift") return "worked";
    if (entry.data.type === "holiday") return "holiday";
    if (entry.data.type === "lieu") return "lieu";
    if (entry.data.type === "sick") return "sick";
    if (entry.data.type === "off") return "dayoff";
  }

  if (plannedToken) {
    if (plannedToken === "on") return "worked";
    if (plannedToken === "holiday") return "holiday";
    if (plannedToken === "lieu") return "lieu";
  }

  return "off";
}

function getDayTypeLabel(entry?: DayEntry | null, plannedToken?: string | null) {
  if (entry) {
    if (entry.data.type === "holiday") return "Holiday";
    if (entry.data.type === "lieu") return "Lieu";
    if (entry.data.type === "sick") return "Sick";
    if (entry.data.type === "shift" && entry.data.shift?.extraShift) return "Extra shift";
    return "Shift";
  }

  if (plannedToken === "on") return "Planned on";
  if (plannedToken === "off") return "Planned off";
  if (plannedToken === "holiday") return "Planned holiday";
  if (plannedToken === "lieu") return "Planned lieu";

  return "Off";
}

function getPlannedLabel(token: string | null) {
  if (!token) return "";
  const t = token.toLowerCase();
  if (t === "on") return "P:ON";
  if (t === "off") return "P:OFF";
  if (t === "holiday") return "P:H";
  if (t === "lieu") return "P:L";
  return "";
}

function getBreakDeductedHours(entry?: DayEntry | null) {
  if (!entry || entry.data.type !== "shift" || !entry.data.shift) return 0;
  if (!entry.data.shift.deductBreak) return 0;

  const rawHours = calcShiftHours(entry.data.shift.start, entry.data.shift.end);
  const requestedBreakHours = (entry.data.shift.breakMinutes ?? 0) / 60;

  return Math.max(0, Math.min(rawHours, requestedBreakHours));
}

function getDayHintTags(
  entry: DayEntry | undefined,
  plannedToken: string | null,
  isPayday: boolean,
  isExtraShiftDay: boolean,
  settings: AppSettings,
  allEntries: DayEntry[]
) {
  const tags: string[] = [getDayTypeLabel(entry, plannedToken)];

  if (entry && entry.data.type === "shift") {
    const paidHours = calcDayPaidHours(entry);
    tags.push(`${paidHours.toFixed(2)}h paid`);

    const deductedBreakHours = getBreakDeductedHours(entry);
    if (deductedBreakHours > 0) {
      tags.push(`break -${deductedBreakHours.toFixed(2)}h`);
    }
  }

  if (isPayday) tags.push("Payday");
  if (isExtraShiftDay) tags.push("Extra shift");

  if (entry) {
    const gross = calcDayGrossWithSettings(entry, settings, allEntries);
    if (gross > 0) {
      tags.push(`£${Math.round(gross * 10) / 10}`);
    }
  }

  return tags.join(" • ");
}

function MonthGrid({
  month,
  selected,
  todayISO,
  dayMap,
  allEntries,
  settings,
  paydayDates,
  extraShiftDates,
  isLoaded,
  isInteractive,
  onDayPress,
  onDayLongPress,
}: {
  month: Date;
  selected: Date | null;
  todayISO: string;
  dayMap: DayMap;
  allEntries: DayEntry[];
  settings: AppSettings;
  paydayDates: Set<string>;
  extraShiftDates: Set<string>;
  isLoaded: boolean;
  isInteractive: boolean;
  onDayPress: (d: Date, dateKey: string, label: string) => void;
  onDayLongPress: (dateKey: string, label: string) => void;
}) {
  const days = useMemo(() => getMonthDays(month), [month]);

  return (
    <>
      <View style={styles.weekRow}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {chunkWeeks(days).map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.gridRow}>
            {week.map((d) => {
          const dateKey = format(d, "yyyy-MM-dd");
          const entry = dayMap[dateKey];
          const plannedToken = !entry ? getPlannedPatternTokenForDate(dateKey, settings) : null;
          const displayKind = getDisplayKind(entry, plannedToken);
          const c = dayColor(displayKind);

          // Work pattern background overlay (only when no entry exists)
          const patternCycleIdx = !entry ? getWorkPatternCycleIndex(dateKey, settings) : -1;
          const patternBg = !entry && patternCycleIdx >= 0
            ? (patternCycleIdx % 2 === 0 ? "rgba(186,230,253,0.35)" : "rgba(187,247,208,0.35)")
            : null;

          const inMonth = isSameMonth(d, month);
          const isSel = selected ? isSameDay(d, selected) : false;
          const isToday = dateKey === todayISO;
          const isPayday = paydayDates.has(dateKey);
          const isExtraShiftDay = extraShiftDates.has(dateKey);
          const plannedLabel = getPlannedLabel(plannedToken);

          const gross = entry ? calcDayGrossWithSettings(entry, settings, allEntries) : 0;
          const showMoney = !!entry && gross > 0;

          const tags = getDayHintTags(
            entry,
            plannedToken,
            isPayday,
            isExtraShiftDay,
            settings,
            allEntries
          );

          return (
            <Pressable
              key={dateKey}
              disabled={!isLoaded || !isInteractive}
              onPress={() => onDayPress(d, dateKey, tags)}
              onLongPress={() => onDayLongPress(dateKey, tags)}
              style={[
                styles.cell,
                { backgroundColor: patternBg && !entry ? patternBg : c.bg, borderColor: c.border, opacity: inMonth ? 1 : 0.4 },
                isSel ? styles.cellSelected : null,
                isExtraShiftDay ? styles.cellExtraShift : null,
              ]}
            >
              <View style={styles.dayTopRow}>
                <View style={[styles.dayBadge, isToday ? styles.todayBadge : null]}>
                  <Text style={[styles.dayNum, { color: c.text }]}>{format(d, "d")}</Text>
                </View>

                <View style={styles.markersWrap}>
                  {isPayday ? (
                    <View style={styles.paydayMarker}>
                      <Ionicons name="cash-outline" size={11} color="#065F46" />
                    </View>
                  ) : null}

                  {isExtraShiftDay ? (
                    <View style={styles.extraShiftMarker}>
                      <Ionicons name="flash-outline" size={11} color="#9A3412" />
                    </View>
                  ) : null}
                </View>
              </View>

              {showMoney ? (
                <Text style={styles.moneyText} numberOfLines={1}>
                  £{Math.round(gross * 10) / 10}
                </Text>
              ) : plannedLabel ? (
                <Text style={styles.planText} numberOfLines={1}>
                  {plannedLabel}
                </Text>
              ) : null}
            </Pressable>
          );
            })}
          </View>
        ))}
      </View>
    </>
  );
}

export default function CalendarHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const [hint, setHint] = useState("");

  const [dayMap, setDayMap] = useState<DayMap>({});
  const [allEntries, setAllEntries] = useState<DayEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [transitionDirection, setTransitionDirection] = useState<SwipeDirection>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const today = useMemo(() => new Date(), []);
  const todayISO = format(today, "yyyy-MM-dd");

  const dragX = useRef(new Animated.Value(0)).current;

  const reload = useCallback(async () => {
    const [storedDays, loadedSettings] = await Promise.all([loadDays(), loadSettings()]);
    setDayMap(storedDays);
    setAllEntries(
      Object.keys(storedDays)
        .sort()
        .map((k) => storedDays[k])
        .filter(Boolean)
    );
    setSettings(loadedSettings);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const currentCycleStart = useMemo(() => getCycleStartForDate(todayISO, settings), [todayISO, settings]);
  const currentCycleEntries = useMemo(
    () => sortByDateAsc(entriesForCycle(dayMap, currentCycleStart, settings)),
    [dayMap, currentCycleStart, settings]
  );
  const currentCycleWorkedHours = useMemo(() => {
    let total = 0;
    for (const entry of currentCycleEntries) {
      if (entry.data.type === "shift") total += calcDayPaidHours(entry);
    }
    return total;
  }, [currentCycleEntries]);
  const currentPaydayISO = useMemo(
    () => getPaydayForCycleStart(currentCycleStart, settings),
    [currentCycleStart, settings]
  );
  const currentAdjustedThreshold = useMemo(
    () => getAdjustedOvertimeThreshold(currentCycleEntries, settings),
    [currentCycleEntries, settings]
  );
  const currentCycleBounds = useMemo(
    () => getCycleBoundsForStart(currentCycleStart, settings),
    [currentCycleStart, settings]
  );
  const currentCycleTotals = useMemo(
    () => calcCycleTotals(currentCycleEntries, settings, allEntries),
    [currentCycleEntries, settings, allEntries]
  );
  const currentCycleNet = useMemo(
    () => estimateNetFromGrossWithSettings(currentCycleTotals.gross, settings),
    [currentCycleTotals.gross, settings]
  );

  // Provisional overtime: hours above 10 per worked day, break treated as paid
  // (raw clock hours start->end). Separate from the 190h threshold overtime.
  const currentCycleProvisionalOvertime = useMemo(() => {
    let total = 0;
    for (const entry of currentCycleEntries) {
      if (entry.data.type === "shift" && entry.data.shift) {
        const h = calcShiftHours(entry.data.shift.start, entry.data.shift.end);
        if (h > 10) total += h - 10;
      }
    }
    return total;
  }, [currentCycleEntries]);

  const currentMonthDays = useMemo(() => getMonthDays(month), [month]);
  const currentVisibleDateKeys = useMemo(
    () => currentMonthDays.map((d) => format(d, "yyyy-MM-dd")),
    [currentMonthDays]
  );

  const currentPaydayDates = useMemo(
    () => buildPaydayDateSet(currentVisibleDateKeys, settings),
    [currentVisibleDateKeys, settings]
  );

  const currentExtraShiftDates = useMemo(
    () => buildExtraShiftDateSet(dayMap, currentVisibleDateKeys),
    [dayMap, currentVisibleDateKeys]
  );

  const previewMonth = useMemo(() => {
    if (transitionDirection === "next") return addMonths(month, 1);
    if (transitionDirection === "prev") return subMonths(month, 1);
    return null;
  }, [month, transitionDirection]);

  const previewMonthDays = useMemo(() => (previewMonth ? getMonthDays(previewMonth) : []), [previewMonth]);
  const previewVisibleDateKeys = useMemo(
    () => previewMonthDays.map((d) => format(d, "yyyy-MM-dd")),
    [previewMonthDays]
  );

  const previewPaydayDates = useMemo(
    () => buildPaydayDateSet(previewVisibleDateKeys, settings),
    [previewVisibleDateKeys, settings]
  );

  const previewExtraShiftDates = useMemo(
    () => buildExtraShiftDateSet(dayMap, previewVisibleDateKeys),
    [dayMap, previewVisibleDateKeys]
  );

  const monthTitle = format(month, "MMMM yyyy");

  const currentOpacity = dragX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0.2, 1, 0.2],
    extrapolate: "clamp",
  });

  const nextOverlayTranslateX = dragX.interpolate({
    inputRange: [-width, 0],
    outputRange: [0, width],
    extrapolate: "clamp",
  });

  const nextOverlayOpacity = dragX.interpolate({
    inputRange: [-width, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const prevOverlayTranslateX = dragX.interpolate({
    inputRange: [0, width],
    outputRange: [-width, 0],
    extrapolate: "clamp",
  });

  const prevOverlayOpacity = dragX.interpolate({
    inputRange: [0, width],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const finishTransition = useCallback(
    (direction: "next" | "prev") => {
      if (isAnimating) return;

      setTransitionDirection(direction);
      setIsAnimating(true);

      const targetX = direction === "next" ? -width : width;

      Animated.timing(dragX, {
        toValue: targetX,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start(() => {
        setMonth((prev) => (direction === "next" ? addMonths(prev, 1) : subMonths(prev, 1)));
        dragX.setValue(0);
        setTransitionDirection(null);
        setIsAnimating(false);
      });
    },
    [dragX, isAnimating, width]
  );

  const cancelTransition = useCallback(() => {
    Animated.spring(dragX, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start(() => {
      setTransitionDirection(null);
    });
  }, [dragX]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !isAnimating &&
        Math.abs(gestureState.dx) > 16 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        if (isAnimating) return;

        if (gestureState.dx < 0) {
          if (transitionDirection !== "next") setTransitionDirection("next");
        } else if (gestureState.dx > 0) {
          if (transitionDirection !== "prev") setTransitionDirection("prev");
        }

        dragX.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isAnimating) return;

        if (gestureState.dx < -SWIPE_THRESHOLD) {
          finishTransition("next");
          return;
        }

        if (gestureState.dx > SWIPE_THRESHOLD) {
          finishTransition("prev");
          return;
        }

        cancelTransition();
      },
      onPanResponderTerminate: () => {
        if (isAnimating) return;
        cancelTransition();
      },
    })
  ).current;

  const onDayPress = (d: Date, dateKey: string, tags: string) => {
    setSelected(d);
    setHint(`${isoToEU(dateKey)} • ${tags}`);
    router.push(`/day/${dateKey}`);
  };

  const onDayLongPress = (dateKey: string, tags: string) => {
    setHint(`Info: ${isoToEU(dateKey)} • ${tags}`);
  };

  const currentMonthKey = format(month, "yyyy-MM");
  const previewMonthKey = previewMonth ? format(previewMonth, "yyyy-MM") : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <MiniPauseBanner appName="WorkPayTracker" />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable
              onPress={() => finishTransition("prev")}
              style={styles.navBtn}
              disabled={isAnimating}
            >
              <Ionicons name="chevron-back" size={20} color="#111827" />
            </Pressable>

            <View style={styles.titleWrap}>
              <Text style={styles.title}>{monthTitle}</Text>
              <Text style={styles.swipeHint}>Swipe left or right</Text>
            </View>

            <Pressable
              onPress={() => finishTransition("next")}
              style={styles.navBtn}
              disabled={isAnimating}
            >
              <Ionicons name="chevron-forward" size={20} color="#111827" />
            </Pressable>
          </View>

          <View style={styles.monthViewport} {...panResponder.panHandlers}>
            <Animated.View
              key={`current-${currentMonthKey}`}
              style={[
                styles.currentMonthWrap,
                {
                  opacity: currentOpacity,
                },
              ]}
            >
              <MonthGrid
                key={`grid-current-${currentMonthKey}`}
                month={month}
                selected={selected}
                todayISO={todayISO}
                dayMap={dayMap}
                allEntries={allEntries}
                settings={settings}
                paydayDates={currentPaydayDates}
                extraShiftDates={currentExtraShiftDates}
                isLoaded={isLoaded}
                isInteractive={!transitionDirection && !isAnimating}
                onDayPress={onDayPress}
                onDayLongPress={onDayLongPress}
              />
            </Animated.View>

            {previewMonth && transitionDirection === "next" ? (
              <Animated.View
                key={`preview-next-${previewMonthKey}`}
                pointerEvents="none"
                style={[
                  styles.overlayMonthWrap,
                  {
                    transform: [{ translateX: nextOverlayTranslateX }],
                    opacity: nextOverlayOpacity,
                  },
                ]}
              >
                <MonthGrid
                  key={`grid-preview-next-${previewMonthKey}`}
                  month={previewMonth}
                  selected={selected}
                  todayISO={todayISO}
                  dayMap={dayMap}
                  allEntries={allEntries}
                  settings={settings}
                  paydayDates={previewPaydayDates}
                  extraShiftDates={previewExtraShiftDates}
                  isLoaded={isLoaded}
                  isInteractive={false}
                  onDayPress={onDayPress}
                  onDayLongPress={onDayLongPress}
                />
              </Animated.View>
            ) : null}

            {previewMonth && transitionDirection === "prev" ? (
              <Animated.View
                key={`preview-prev-${previewMonthKey}`}
                pointerEvents="none"
                style={[
                  styles.overlayMonthWrap,
                  {
                    transform: [{ translateX: prevOverlayTranslateX }],
                    opacity: prevOverlayOpacity,
                  },
                ]}
              >
                <MonthGrid
                  key={`grid-preview-prev-${previewMonthKey}`}
                  month={previewMonth}
                  selected={selected}
                  todayISO={todayISO}
                  dayMap={dayMap}
                  allEntries={allEntries}
                  settings={settings}
                  paydayDates={previewPaydayDates}
                  extraShiftDates={previewExtraShiftDates}
                  isLoaded={isLoaded}
                  isInteractive={false}
                  onDayPress={onDayPress}
                  onDayLongPress={onDayLongPress}
                />
              </Animated.View>
            ) : null}
          </View>

          <View style={styles.legendCard}>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.legendWorked} />
                <Text style={styles.legendText}>Worked</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendHoliday} />
                <Text style={styles.legendText}>Holiday</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendLieu} />
                <Text style={styles.legendText}>Lieu</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendOff} />
                <Text style={styles.legendText}>Off</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendDayOff} />
                <Text style={styles.legendText}>Day off</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendIconPay}>
                  <Ionicons name="cash-outline" size={13} color="#065F46" />
                </View>
                <Text style={styles.legendText}>Payday</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendIconExtraShift}>
                  <Ionicons name="flash-outline" size={13} color="#9A3412" />
                </View>
                <Text style={styles.legendText}>Extra shift</Text>
              </View>

              <View style={styles.legendItem}>
                <View style={styles.legendTodayRing} />
                <Text style={styles.legendText}>Today</Text>
              </View>
            </View>
          </View>

          <View style={styles.dashboardCard}>
            <Text style={styles.dashboardTitle}>
              Current Cycle - Payday: {isoToEU(currentPaydayISO)}
            </Text>
            <Text style={styles.dashboardLine}>Cycle start: {isoToEU(currentCycleBounds.startISO)}</Text>
            <Text style={styles.dashboardLine}>Cycle closes: {isoToEU(currentCycleBounds.endISOInclusive)}</Text>
            <Text style={styles.dashboardLine}>Paid shift hours: {currentCycleWorkedHours.toFixed(2)}h</Text>
            <Text style={styles.dashboardLine}>
              Extra hours: {currentCycleTotals.overtimeHours.toFixed(2)}h
            </Text>
            <Text style={styles.dashboardLine}>
              Provisional overtime (over 10h/day): {currentCycleProvisionalOvertime.toFixed(2)}h
            </Text>
            <Text style={styles.dashboardLine}>
              Adjusted overtime threshold: {currentAdjustedThreshold.toFixed(2)}h
            </Text>
            <Text style={styles.dashboardLine}>
              Net pay: £{currentCycleNet.net.toFixed(2)}
            </Text>
            </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {hint || (isLoaded ? "Tap a day • long-press for info • swipe to change month" : "Loading...")}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_WARM },

  screen: {
    flex: 1,
    backgroundColor: BG_WARM,
  },

  container: {
    flexGrow: 1,
    backgroundColor: BG_WARM,
    padding: 12,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  titleWrap: {
    alignItems: "center",
  },

  title: { fontSize: 20, fontWeight: "800", color: "#111827" },

  swipeHint: {
    marginTop: 2,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "700",
  },

  navBtn: {
    width: 46,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: CARD_WARM,
    alignItems: "center",
    justifyContent: "center",
  },

  monthViewport: {
    position: "relative",
    overflow: "hidden",
  },

  currentMonthWrap: {
    width: "100%",
  },

  overlayMonthWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
  },

  weekRow: { flexDirection: "row", marginBottom: 8 },

  weekday: {
    flex: 1,
    textAlign: "center",
    color: "#6B7280",
    fontWeight: "800",
  },

  grid: {},

  gridRow: { flexDirection: "row" },

  cell: {
    width: "14.2857%",
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 6,
  },

  cellSelected: { borderWidth: 2 },

  cellExtraShift: {
    borderColor: "#F97316",
    borderWidth: 2,
  },

  dayTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  dayBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  todayBadge: {
    borderWidth: 2,
    borderColor: "#111827",
    transform: [{ rotate: "-6deg" }],
  },

  dayNum: {
    fontSize: 14,
    fontWeight: "900",
  },

  markersWrap: {
    alignItems: "flex-end",
    gap: 4,
  },

  paydayMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    alignItems: "center",
    justifyContent: "center",
  },

  extraShiftMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFEDD5",
    borderWidth: 1,
    borderColor: "#FDBA74",
    alignItems: "center",
    justifyContent: "center",
  },

  moneyText: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "900",
    color: "#111827",
  },

  planText: {
    marginTop: 4,
    fontSize: 8,
    fontWeight: "900",
    color: "#6B7280",
  },

  legendCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: CARD_WARM,
  },

  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },

  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },

  legendText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 12,
  },

  legendWorked: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#22C55E",
  },

  legendHoliday: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },

  legendLieu: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#0284C7",
  },

  legendOff: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },

  legendDayOff: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EAE3D8",
    borderWidth: 1,
    borderColor: "#B5A892",
  },

  legendIconPay: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    alignItems: "center",
    justifyContent: "center",
  },

  legendIconExtraShift: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFEDD5",
    borderWidth: 1,
    borderColor: "#FDBA74",
    alignItems: "center",
    justifyContent: "center",
  },

  legendTodayRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#111827",
    transform: [{ rotate: "-6deg" }],
  },

  dashboardCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: CARD_WARM,
  },

  dashboardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },

  dashboardLine: {
    color: "#374151",
    fontWeight: "700",
    marginTop: 2,
  },

  footer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: CARD_WARM,
  },

  footerText: {
    color: "#6B7280",
    fontWeight: "700",
  },
});
