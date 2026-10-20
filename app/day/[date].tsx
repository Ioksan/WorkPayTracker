import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { DayEntry, DayMap, loadDays, saveDays } from "../../src/storage/calendarStorage";
import { calcDayGrossWithSettings, calcShiftHours, normaliseHHmm } from "../../src/lib/pay";
import { AppSettings, DEFAULT_SETTINGS, loadSettings } from "../../src/storage/settingsStorage";

const BG_WARM = "#FFFBF2";
const CARD_WARM = "#FFF4E6";
const BORDER_WARM = "#F1E3D3";

type EntryType = "shift" | "holiday" | "lieu" | "sick" | "off";

function isoToDisplay(dateISO: string) {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-");
  return `${d}-${m}-${y}`;
}

function shiftISO(dateISO: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function ddmm(dateISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const [, m, d] = dateISO.split("-");
  return `${d}-${m}`;
}

function todayISOLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isValidHHmm(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test((value || "").trim());
}

function toInteger(value: string) {
  const n = Number(String(value || "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function getInitialType(entry?: DayEntry | null): EntryType {
  if (!entry) return "shift";
  if (entry.data.type === "holiday") return "holiday";
  if (entry.data.type === "lieu") return "lieu";
  if (entry.data.type === "sick") return "sick";
  if (entry.data.type === "off") return "off";
  return "shift";
}

function getWorkedStatus(type: EntryType) {
  if (type === "holiday") return "holiday";
  if (type === "lieu") return "holiday";
  if (type === "sick") return "sick";
  if (type === "off") return "off";
  return "worked";
}

function Field({
  label,
  value,
  onChangeText,
  onBlur,
  onFocus,
  placeholder,
  multiline = false,
  keyboardType = "default",
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numeric";
  editable?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline ? styles.multiInput : null,
          !editable ? styles.inputDisabled : null,
        ]}
      />
    </View>
  );
}

function TypeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.typeBtn, active ? styles.typeBtnActive : null]}
    >
      <Text style={[styles.typeBtnText, active ? styles.typeBtnTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  hint,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <View style={styles.toggleWrap}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function RowLike({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoRowLabel, strong ? styles.strong : null]}>{label}</Text>
      <Text style={[styles.infoRowValue, strong ? styles.strong : null]}>{value}</Text>
    </View>
  );
}

export default function DayDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const dateISO = Array.isArray(params.date) ? params.date[0] : params.date || "";

  const [allDays, setAllDays] = useState<DayMap>({});
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [entryType, setEntryType] = useState<EntryType>("shift");
  const [startText, setStartText] = useState("21:30");
  const [endText, setEndText] = useState("06:00");
  const [extraShift, setExtraShift] = useState(false);
  const [min8h, setMin8h] = useState(false);
  const [nightOut, setNightOut] = useState(false);

  const [deductBreak, setDeductBreak] = useState(false);
  const [breakMinutesText, setBreakMinutesText] = useState("0");

  const [notesText, setNotesText] = useState("");

  const normalizeTimeFields = useCallback(() => {
    setStartText((prev) => normaliseHHmm(prev));
    setEndText((prev) => normaliseHHmm(prev));
  }, []);

  useEffect(() => {
    (async () => {
      const [days, loadedSettings] = await Promise.all([loadDays(), loadSettings()]);
      setAllDays(days);
      setSettings(loadedSettings);

      const existing = days[dateISO];

      if (existing) {
        setEntryType(getInitialType(existing));
        setNotesText(existing.data.notes || "");

        if (existing.data.type === "shift" && existing.data.shift) {
          setStartText(existing.data.shift.start || "21:30");
          setEndText(existing.data.shift.end || "06:00");
          setExtraShift(!!existing.data.shift.extraShift);
          setMin8h(!!existing.data.shift.min8h);
          setNightOut(!!existing.data.shift.nightOut);
          setDeductBreak(!!existing.data.shift.deductBreak);
          setBreakMinutesText(String(existing.data.shift.breakMinutes ?? 0));
        }
      } else {
        setEntryType("shift");
        setNotesText("");
        setStartText("21:30");
        setEndText("06:00");
        setExtraShift(false);
        setMin8h(true);
        setNightOut(false);
        setDeductBreak(!!loadedSettings.defaultDeductBreak);
        setBreakMinutesText(
          String(loadedSettings.defaultDeductBreak ? loadedSettings.defaultBreakMinutes : 0)
        );
      }

      setLoading(false);
    })();
  }, [dateISO]);

  useEffect(() => {
    if (!deductBreak) {
      setBreakMinutesText("0");
    }
  }, [deductBreak]);

  const rawShiftHours = useMemo(() => {
    const normalizedStart = normaliseHHmm(startText);
    const normalizedEnd = normaliseHHmm(endText);
    if (!isValidHHmm(normalizedStart) || !isValidHHmm(normalizedEnd)) return 0;
    return calcShiftHours(normalizedStart, normalizedEnd);
  }, [startText, endText]);

  const deductedBreakHours = useMemo(() => {
    if (!deductBreak) return 0;
    return toInteger(breakMinutesText) / 60;
  }, [deductBreak, breakMinutesText]);

  const payableShiftHours = useMemo(() => {
    if (entryType !== "shift") return 0;

    let hours = Math.max(0, rawShiftHours - deductedBreakHours);
    if (min8h && hours > 0 && hours < 8) {
      hours = 8;
    }
    return hours;
  }, [entryType, rawShiftHours, deductedBreakHours, min8h]);

  const finalPaidDayAmount = useMemo(() => {
    if (entryType !== "shift") return 0;

    const normalizedStart = normaliseHHmm(startText);
    const normalizedEnd = normaliseHHmm(endText);

    if (!isValidHHmm(normalizedStart) || !isValidHHmm(normalizedEnd)) return 0;

    const tempEntry: DayEntry = {
      date: dateISO,
      status: "worked",
      data: {
        type: "shift",
        notes: notesText.trim(),
        shift: {
          start: normalizedStart,
          end: normalizedEnd,
          extraShift,
          min8h,
          nightOut,
          deductBreak,
          breakMinutes: deductBreak ? toInteger(breakMinutesText) : 0,
        },
      },
    };

    const allEntries = Object.keys(allDays)
      .sort()
      .map((k) => allDays[k])
      .filter(Boolean);

    return calcDayGrossWithSettings(tempEntry, settings, allEntries);
  }, [
    entryType,
    dateISO,
    startText,
    endText,
    notesText,
    extraShift,
    min8h,
    nightOut,
    deductBreak,
    breakMinutesText,
    allDays,
    settings,
  ]);

  const nightOutAllowed = useMemo(() => rawShiftHours >= 15, [rawShiftHours]);

  useEffect(() => {
    if (!nightOutAllowed && nightOut) {
      setNightOut(false);
    }
  }, [nightOutAllowed, nightOut]);

  const validationError = useMemo(() => {
    if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return "Invalid date.";
    }

    if (entryType !== "shift") return "";

    const normalizedStart = normaliseHHmm(startText);
    const normalizedEnd = normaliseHHmm(endText);

    if (!isValidHHmm(normalizedStart)) return "Start time must be HH:mm.";
    if (!isValidHHmm(normalizedEnd)) return "End time must be HH:mm.";
    if (deductBreak && toInteger(breakMinutesText) <= 0) {
      return "Break minutes must be greater than 0 when unpaid break deduction is enabled.";
    }

    const validationRawHours = calcShiftHours(normalizedStart, normalizedEnd);
    if (deductBreak && toInteger(breakMinutesText) / 60 >= validationRawHours && validationRawHours > 0) {
      return "Break minutes cannot be equal to or greater than total shift hours.";
    }

    return "";
  }, [dateISO, entryType, startText, endText, deductBreak, breakMinutesText]);

  const saveEntry = useCallback(async () => {
    const normalizedStart = normaliseHHmm(startText);
    const normalizedEnd = normaliseHHmm(endText);

    setStartText(normalizedStart);
    setEndText(normalizedEnd);

    if (entryType === "shift") {
      if (!isValidHHmm(normalizedStart)) {
        Alert.alert("Cannot save", "Start time must be HH:mm.");
        return;
      }

      if (!isValidHHmm(normalizedEnd)) {
        Alert.alert("Cannot save", "End time must be HH:mm.");
        return;
      }

      if (deductBreak && toInteger(breakMinutesText) <= 0) {
        Alert.alert("Cannot save", "Break minutes must be greater than 0 when unpaid break deduction is enabled.");
        return;
      }

      const saveRawHours = calcShiftHours(normalizedStart, normalizedEnd);
      const saveDeductedBreakHours = deductBreak ? toInteger(breakMinutesText) / 60 : 0;

      if (saveDeductedBreakHours >= saveRawHours && saveRawHours > 0) {
        Alert.alert("Cannot save", "Break minutes cannot be equal to or greater than total shift hours.");
        return;
      }
    } else if (validationError) {
      Alert.alert("Cannot save", validationError);
      return;
    }

    const nextMap: DayMap = { ...allDays };

    if (entryType === "shift") {
      nextMap[dateISO] = {
        date: dateISO,
        status: getWorkedStatus(entryType),
        data: {
          type: "shift",
          notes: notesText.trim(),
          shift: {
            start: normalizedStart,
            end: normalizedEnd,
            extraShift,
            min8h,
            nightOut: nightOutAllowed ? nightOut : false,
            deductBreak,
            breakMinutes: deductBreak ? toInteger(breakMinutesText) : 0,
          },
        },
      } as DayEntry;
    } else {
      nextMap[dateISO] = {
        date: dateISO,
        status: getWorkedStatus(entryType),
        data: {
          type: entryType,
          notes: notesText.trim(),
        },
      } as DayEntry;
    }

    await saveDays(nextMap);
    setAllDays(nextMap);
    setMsg("Saved.");
    router.back();
  }, [
    startText,
    endText,
    entryType,
    validationError,
    deductBreak,
    breakMinutesText,
    allDays,
    dateISO,
    notesText,
    extraShift,
    min8h,
    nightOut,
    nightOutAllowed,
    router,
  ]);

  const clearEntry = useCallback(async () => {
    Alert.alert("Clear entry", `Remove saved data for ${isoToDisplay(dateISO)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          const nextMap = { ...allDays };
          delete nextMap[dateISO];
          await saveDays(nextMap);
          setAllDays(nextMap);
          router.back();
        },
      },
    ]);
  }, [allDays, dateISO, router]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.container, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          normalizeTimeFields();
        }}
      >
        <Text style={styles.title}>Day Details</Text>
        <Text style={styles.subtitle}>{isoToDisplay(dateISO)}</Text>

        <View style={styles.dayNavRow}>
          <Pressable style={styles.dayNavBtn} onPress={() => router.replace(`/day/${shiftISO(dateISO, -1)}`)}>
            <Text style={styles.dayNavText}>{`◀ ${ddmm(shiftISO(dateISO, -1))}`}</Text>
          </Pressable>
          <Pressable style={[styles.dayNavBtn, styles.dayNavBtnToday]} onPress={() => router.replace(`/day/${todayISOLocal()}`)}>
            <Text style={[styles.dayNavText, styles.dayNavTextToday]}>Today</Text>
          </Pressable>
          <Pressable style={styles.dayNavBtn} onPress={() => router.replace(`/day/${shiftISO(dateISO, 1)}`)}>
            <Text style={styles.dayNavText}>{`${ddmm(shiftISO(dateISO, 1))} ▶`}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Type</Text>
          <View style={styles.typeRow}>
            <TypeButton
              label="Shift"
              active={entryType === "shift"}
              onPress={() => {
                Keyboard.dismiss();
                normalizeTimeFields();
                setEntryType("shift");
              }}
            />
            <TypeButton
              label="Holiday"
              active={entryType === "holiday"}
              onPress={() => {
                Keyboard.dismiss();
                normalizeTimeFields();
                setEntryType("holiday");
              }}
            />
            <TypeButton
              label="Lieu"
              active={entryType === "lieu"}
              onPress={() => {
                Keyboard.dismiss();
                normalizeTimeFields();
                setEntryType("lieu");
              }}
            />
            <TypeButton
              label="Sick"
              active={entryType === "sick"}
              onPress={() => {
                Keyboard.dismiss();
                normalizeTimeFields();
                setEntryType("sick");
              }}
            />
            <TypeButton
              label="Day off"
              active={entryType === "off"}
              onPress={() => {
                Keyboard.dismiss();
                normalizeTimeFields();
                setEntryType("off");
              }}
            />
          </View>
        </View>

        {entryType === "shift" ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Shift</Text>

            <Field
              label="Start shift time"
              value={startText}
              onChangeText={setStartText}
              onFocus={() => setStartText("")}
              onBlur={() => setStartText(normaliseHHmm(startText))}
              placeholder="21:30"
              keyboardType="numeric"
            />

            <Field
              label="Finish shift time"
              value={endText}
              onChangeText={setEndText}
              onFocus={() => setEndText("")}
              onBlur={() => setEndText(normaliseHHmm(endText))}
              placeholder="06:00"
              keyboardType="numeric"
            />

            <ToggleRow
              label="Enable unpaid break deduction"
              value={deductBreak}
              onValueChange={setDeductBreak}
              hint="Disable for paid breaks. Enable only if break minutes must be deducted from worked hours."
            />

            <Field
              label="Break minutes"
              value={breakMinutesText}
              onChangeText={setBreakMinutesText}
              placeholder="0"
              keyboardType="numeric"
              editable={deductBreak}
            />

            <ToggleRow
              label="Extra shift"
              value={extraShift}
              onValueChange={setExtraShift}
              hint="Use this only when the whole day is an extra call-in shift."
            />

            <ToggleRow
              label="Minimum 8h guarantee"
              value={min8h}
              onValueChange={setMin8h}
              hint="If enabled and paid hours are below 8, the app pays 8h."
            />

            <ToggleRow
              label="Night Out"
              value={nightOut}
              onValueChange={setNightOut}
              hint={
                nightOutAllowed
                  ? "Allowed because raw shift length is at least 15h."
                  : "Available only if raw shift length is at least 15h."
              }
            />

            <View style={styles.infoBox}>
              <RowLike label="Raw shift length" value={`${rawShiftHours.toFixed(2)}h`} />
              <RowLike label="Break deducted" value={`${deductedBreakHours.toFixed(2)}h`} />
              <RowLike label="Final paid hours" value={`${payableShiftHours.toFixed(2)}h`} strong />
              <RowLike label="Final paid day amount" value={`£${finalPaidDayAmount.toFixed(2)}`} strong />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pay meaning</Text>
            {entryType === "holiday" ? (
              <>
                <Text style={styles.infoText}>
                  Holiday is paid as 10h at base rate plus approximate average premium from historical data.
                </Text>
                <Text style={styles.infoText}>
                  This entry reduces threshold overtime by 10h in the cycle.
                </Text>
              </>
            ) : null}

            {entryType === "lieu" ? (
              <>
                <Text style={styles.infoText}>Lieu is paid as 10h at base rate only.</Text>
                <Text style={styles.infoText}>
                  This entry reduces threshold overtime by 10h in the cycle.
                </Text>
              </>
            ) : null}

            {entryType === "sick" ? (
              <Text style={styles.infoText}>Sick days are tracked but unpaid in the app.</Text>
            ) : null}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Field
            label="Notes"
            value={notesText}
            onChangeText={setNotesText}
            placeholder="Optional notes"
            multiline
          />
        </View>

        {validationError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{validationError}</Text>
          </View>
        ) : null}

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={saveEntry} style={[styles.actionBtn, styles.primaryBtn]}>
          <Text style={styles.primaryBtnText}>Save</Text>
        </Pressable>

        <Pressable onPress={clearEntry} style={[styles.actionBtn, styles.secondaryBtn]}>
          <Text style={styles.secondaryBtnText}>Clear day</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG_WARM,
  },

  screen: {
    flex: 1,
    backgroundColor: BG_WARM,
  },

  container: {
    padding: 12,
    backgroundColor: BG_WARM,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG_WARM,
  },

  loadingText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 16,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },

  subtitle: {
    marginTop: 4,
    color: "#6B7280",
    fontWeight: "800",
    fontSize: 13,
  },

  dayNavRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  dayNavBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: CARD_WARM,
  },
  dayNavBtnToday: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  dayNavText: {
    color: "#374151",
    fontWeight: "900",
    fontSize: 13,
  },
  dayNavTextToday: {
    color: "#FFFBF2",
  },

  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    borderRadius: 14,
    padding: 12,
    backgroundColor: CARD_WARM,
  },

  sectionTitle: {
    fontWeight: "900",
    color: "#111827",
    marginBottom: 10,
    fontSize: 16,
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  typeBtn: {
    borderWidth: 1,
    borderColor: BORDER_WARM,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },

  typeBtnActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },

  typeBtnText: {
    color: "#111827",
    fontWeight: "900",
  },

  typeBtnTextActive: {
    color: "#FFFFFF",
  },

  fieldWrap: {
    marginTop: 10,
  },

  label: {
    fontWeight: "900",
    color: "#111827",
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER_WARM,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#FFFFFF",
    color: "#111827",
  },

  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },

  multiInput: {
    minHeight: 90,
  },

  toggleWrap: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  toggleTextWrap: {
    flex: 1,
  },

  hint: {
    color: "#6B7280",
    fontWeight: "700",
    fontSize: 12,
    marginTop: 2,
  },

  infoBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 10,
    gap: 8,
  },

  infoText: {
    color: "#111827",
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 4,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },

  infoRowLabel: {
    flex: 1,
    color: "#374151",
    fontWeight: "800",
  },

  infoRowValue: {
    color: "#111827",
    fontWeight: "800",
    textAlign: "right",
  },

  strong: {
    fontWeight: "900",
    color: "#111827",
  },

  errorCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#FEF2F2",
  },

  errorText: {
    color: "#991B1B",
    fontWeight: "900",
  },

  msg: {
    marginTop: 10,
    color: "#6B7280",
    fontWeight: "900",
  },

  footer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER_WARM,
    backgroundColor: BG_WARM,
  },

  actionBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },

  primaryBtn: {
    backgroundColor: "#111827",
  },

  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 16,
  },

  secondaryBtnText: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 16,
  },
});
