import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import MiniPauseBanner from "../../components/minipause/MiniPauseBanner";
import PremiumSwitch from "../../components/ui/PremiumSwitch";
import PremiumButton from "../../components/ui/PremiumButton";
import { D } from "../../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { getDaysInMonth, getDay } from "date-fns";
import {
  AppSettings,
  loadSettings,
  saveSettings,
} from "../../src/storage/settingsStorage";
import { Ionicons } from "@expo/vector-icons";

const BG_WARM = "#FFFBF2";
const CARD_WARM = "#FFF4E6";
const BORDER_WARM = "#F1E3D3";
const DAYS_KEY = "workpay_days";
const SETTINGS_KEY = "workpay_settings";
const BACKUP_VERSION = 1;

function toNumber(input: string) {
  const cleaned = (input || "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
function toInteger(input: string) {
  const cleaned = (input || "").replace(/[^\d-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}
function normalizeEUDate(input: string) {
  return (input || "").replace(/[./]/g, "-");
}
function isoToEU(iso: string) {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}-${m}-${y}`;
}
function euToISO(eu: string) {
  if (!eu) return "";
  const parts = eu.split("-");
  if (parts.length !== 3) return "";
  const [d, m, y] = parts;
  if (!d || !m || !y) return "";
  return `${y}-${m}-${d}`;
}
function isValidHHmm(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test((value || "").trim());
}
function isValidEUDate(value: string) {
  if (!/^\d{2}-\d{2}-\d{4}$/.test((value || "").trim())) return false;
  const [d, m, y] = value.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function getBackupFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `WorkPayTracker_backup_${y}-${m}-${d}.json`;
}
function formatMonthTitle(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

const FIELD_INFO: Record<string, { title: string; text: string }> = {
  baseRate: { title: "Base rate", text: "Your normal hourly rate before premiums, overtime or other additions are applied." },
  nightPremium: { title: "Night premium", text: "Extra money added per hour for work done between 18:00 and 06:00." },
  saturdayPremium: { title: "Saturday premium", text: "Extra money added per hour for hours worked on Saturday." },
  sundayPremium: { title: "Sunday premium", text: "Extra money added per hour for hours worked on Sunday." },
  baseOvertimeThresholdHours: { title: "Base overtime threshold", text: "Standard threshold before overtime starts. Holiday and lieu days reduce it by 10 hours each in the cycle." },
  overtimeMultiplier: { title: "Overtime multiplier", text: "Multiplier applied to the base rate once the adjusted threshold is exceeded." },
  extraShiftMultiplier: { title: "Extra shift multiplier", text: "Multiplier used when a shift is marked as an extra shift." },
  x2Multiplier: { title: "X2 multiplier", text: "Multiplier used for qualifying public holiday hours." },
  nightOutAllowance: { title: "Night out allowance", text: "Flat amount added when a shift qualifies for the Night Out rule." },
  taxCode: { title: "Tax code", text: "Used for a rough PAYE estimate only." },
  defaultDeductBreak: { title: "Default unpaid break deduction", text: "Default state for new shift entries. Keep off if breaks are normally paid." },
  defaultBreakMinutes: { title: "Default break minutes", text: "Default break value for new shift entries. Only matters when unpaid break deduction is enabled." },
  cycleMode: { title: "Cycle mode", text: "Payday anchor: give a known payday and cycle length — the app derives all cycles automatically.\n\nManual: define the cycle start and end dates yourself." },
  knownPayday: { title: "Known payday", text: "A payday date you know is correct (must be a Friday). The app derives all past and future cycles from this date." },
  cycleLengthDays: { title: "Cycle length", text: "How many days your pay cycle lasts. For example, a 28-day (4-week) cycle." },
  cycleFirstDate: { title: "Cycle first date", text: "First date of the pay cycle. Example: 04-01-2026." },
  cycleLastDate: { title: "Cycle last date", text: "Last date of the pay cycle. Example: 31-01-2026." },
  cycleStartTime: { title: "Cycle start time", text: "Exact time when the cycle boundary occurs. Example: 21:30." },
  cycleRepeats: { title: "Apply repetition", text: "If enabled, the cycle repeats automatically after the last cycle day." },
  paydayOffsetDays: { title: "Payday offset", text: "How many days after cycle end payday happens. Example: 5 means the Friday after a Sunday close." },
  goodFriday: { title: "Good Friday", text: "Used for public holiday x2 calculations." },
  easterMonday: { title: "Easter Monday", text: "Used for public holiday x2 calculations." },
  nightStart: { title: "Night premium start", text: "Time the night premium window begins. Example: 18:00." },
  nightEnd: { title: "Night premium end", text: "Time the night premium window ends. Example: 06:00. If earlier than the start, the window crosses midnight." },
  pensionPercent: { title: "Pension percent", text: "Employee pension contribution percentage, applied to gross above the free allowance per pay period." },
  pensionFreeAllowancePerPeriod: { title: "Pension free allowance", text: "Lower qualifying earnings per pay period. Pension is not taken on this part of gross. Example: 480 per 4-week period." },
  unionFlat: { title: "Union fee", text: "Flat union fee deducted each pay period. Leave at 0 if you are not in a union." },
  workPattern: { title: "Work pattern", text: "Visual overlay on the calendar showing your planned working pattern. Tap days to mark them as working (green) or off (grey). The pattern repeats automatically." },
};

const APP_MANUAL_TEXT = `
1. Calendar
- Calendar is the main page of the app.
- Tap a day to open Day Details.
- Long press a day to see a quick day summary.
- Green means worked shift.
- Yellow means holiday.
- Blue means lieu.
- Red means sick.
- White means off.
- Cash icon means payday.
- Flash icon means extra shift.
- Alternating blue/green background shows your work pattern cycle.

2. Day Details
- Choose the correct type first: Shift, Holiday, Lieu or Sick.
- For Shift, enter start and finish times.
- Use Extra shift only for real extra call-in shifts.
- Use Minimum 8h guarantee only where this should apply.
- Use Night Out only when the raw shift length qualifies.
- If your break is paid, leave unpaid break deduction off.
- If your break is unpaid, enable it and enter break minutes.
- Save when finished.

3. How paid hours work
- Shift paid hours are based on start and end time.
- If unpaid break deduction is enabled, break minutes are removed from paid hours.
- If Minimum 8h guarantee is enabled, the app raises paid hours to 8 when applicable.
- Holiday pays 10 hours at base rate plus approximate average premium from previous historical shifts.
- Lieu pays 10 hours at base rate only.
- Sick is tracked as unpaid.

4. Calendar Current Cycle card
- Shows the current cycle start and close date.
- Shows paid shift hours in the cycle.
- Shows extra hours above the adjusted overtime threshold.
- Shows estimated net pay for the current cycle.
- Shows the payday date for that cycle.

5. Summary page
- This month shows a quick month total.
- Cycle shows the selected cycle totals.
- Premium breakdown shows night, Saturday and Sunday premium hours and pay.
- Settings currently used shows the values the app is using right now.

6. Settings
- Base rate is your normal hourly pay.
- Premiums are added on top where applicable.
- Base overtime threshold is the normal threshold before overtime starts.
- Holiday and lieu reduce the threshold by 10 hours each in a cycle.
- Payday anchor mode: enter a known payday and cycle length — everything else is automatic.
- Manual mode: define cycle dates and payday offset yourself.

7. Work pattern
- Tap Configure Pattern to open the pattern editor.
- Tap the first day of your pattern to set the start.
- Tap each day to toggle between working (green) and off (grey).
- Tap Save when done. The pattern repeats automatically.
- Tap Clear to remove the pattern.

8. Data backup
- Use Export Data to save a backup file with all your shifts and settings.
- Use Import Data to restore from a previously exported backup.
- Always export before reinstalling the app.

9. Important
- The app is an estimate tool.
- Net pay is approximate.
- Real payroll can still differ due to tax, NI, pension, student loan, adjustments and employer payroll rules.
`.trim();

function InfoLabel({ label, infoKey, onOpenInfo }: { label: string; infoKey: string; onOpenInfo: (key: string) => void }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => onOpenInfo(infoKey)} style={styles.infoBtn}>
        <Text style={styles.infoBtnText}>i</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, infoKey, value, onChangeText, onOpenInfo, placeholder, keyboardType = "default", helpText, editable = true }: {
  label: string; infoKey: string; value: string; onChangeText: (text: string) => void;
  onOpenInfo: (key: string) => void; placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "numeric"; helpText?: string; editable?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <InfoLabel label={label} infoKey={infoKey} onOpenInfo={onOpenInfo} />
      <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType}
        style={[styles.input, !editable ? styles.inputDisabled : null]}
        placeholder={placeholder} placeholderTextColor="#3A4050"
        textAlignVertical="center" editable={editable} />
      {helpText ? <Text style={styles.helpText}>{helpText}</Text> : null}
    </View>
  );
}

// Cycle length selector: 7 / 14 / 28
function CycleLengthSelector({ value, onChange }: { value: number; onChange: (v: 7 | 14 | 28) => void }) {
  const options: Array<{ label: string; value: 7 | 14 | 28 }> = [
    { label: "7 days", value: 7 },
    { label: "14 days", value: 14 },
    { label: "28 days", value: 28 },
  ];
  return (
    <View style={styles.selectorRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.selectorBtn, value === opt.value && styles.selectorBtnActive]}
        >
          <Text style={[styles.selectorBtnText, value === opt.value && styles.selectorBtnTextActive]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [errorList, setErrorList] = useState<string[]>([]);
  const [activeInfoKey, setActiveInfoKey] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Work pattern editor
  const [showPatternEditor, setShowPatternEditor] = useState(false);
  const [patternEditorMonth, setPatternEditorMonth] = useState(new Date());
  const [draftPatternStartDate, setDraftPatternStartDate] = useState("");
  const [draftPatternDays, setDraftPatternDays] = useState<string[]>([]);

  // Cycle mode
  const [cycleMode, setCycleMode] = useState<"payday_anchor" | "custom_range">("payday_anchor");

  // Mode 2 — Payday anchor
  const [knownPaydayText, setKnownPaydayText] = useState("");
  const [cycleLengthDaysValue, setCycleLengthDaysValue] = useState<7 | 14 | 28>(28);

  // Mode 1 — Manual
  const [cycleFirstDateText, setCycleFirstDateText] = useState("");
  const [cycleLastDateText, setCycleLastDateText] = useState("");
  const [cycleStartTimeText, setCycleStartTimeText] = useState("");
  const [cycleRepeats, setCycleRepeats] = useState(true);
  const [paydayOffsetDaysText, setPaydayOffsetDaysText] = useState("");

  // Pay fields
  const [baseRateText, setBaseRateText] = useState("");
  const [nightPremiumText, setNightPremiumText] = useState("");
  const [saturdayPremiumText, setSaturdayPremiumText] = useState("");
  const [sundayPremiumText, setSundayPremiumText] = useState("");
  const [baseOvertimeThresholdHoursText, setBaseOvertimeThresholdHoursText] = useState("");
  const [overtimeMultiplierText, setOvertimeMultiplierText] = useState("");
  const [extraShiftMultiplierText, setExtraShiftMultiplierText] = useState("");
  const [x2MultiplierText, setX2MultiplierText] = useState("");
  const [nightOutAllowanceText, setNightOutAllowanceText] = useState("");
  const [taxCodeText, setTaxCodeText] = useState("");
  const [defaultDeductBreak, setDefaultDeductBreak] = useState(false);
  const [defaultBreakMinutesText, setDefaultBreakMinutesText] = useState("");
  const [goodFridayText, setGoodFridayText] = useState("");
  const [easterMondayText, setEasterMondayText] = useState("");

  // Night premium window + statutory deductions
  const [nightStartText, setNightStartText] = useState("");
  const [nightEndText, setNightEndText] = useState("");
  const [pensionPercentText, setPensionPercentText] = useState("");
  const [pensionFreeAllowanceText, setPensionFreeAllowanceText] = useState("");
  const [unionFlatText, setUnionFlatText] = useState("");

  async function reloadSettingsIntoForm() {
    try {
      const s = await loadSettings();
      setSettings(s);
      setBaseRateText(String(s.baseRate));
      setNightPremiumText(String(s.nightPremium));
      setSaturdayPremiumText(String(s.saturdayPremium));
      setSundayPremiumText(String(s.sundayPremium));
      setBaseOvertimeThresholdHoursText(String(s.baseOvertimeThresholdHours));
      setOvertimeMultiplierText(String(s.overtimeMultiplier));
      setExtraShiftMultiplierText(String(s.extraShiftMultiplier));
      setX2MultiplierText(String(s.x2Multiplier));
      setNightOutAllowanceText(String(s.nightOutAllowance));
      setTaxCodeText(s.taxCode);
      setDefaultDeductBreak(!!s.defaultDeductBreak);
      setDefaultBreakMinutesText(String(s.defaultBreakMinutes ?? 0));
      setCycleMode(s.cycleType === "custom_range" ? "custom_range" : "payday_anchor");
      setKnownPaydayText(isoToEU(s.knownPayday));
      setCycleLengthDaysValue(s.cycleLengthDays === 7 || s.cycleLengthDays === 14 ? s.cycleLengthDays : 28);
      setCycleFirstDateText(isoToEU(s.cycleFirstDate));
      setCycleLastDateText(isoToEU(s.cycleLastDate));
      setCycleStartTimeText(s.cycleStartTime);
      setCycleRepeats(s.cycleRepeats);
      setPaydayOffsetDaysText(String(s.paydayOffsetDays));
      setGoodFridayText(isoToEU(s.goodFriday));
      setEasterMondayText(isoToEU(s.easterMonday));
      setNightStartText(s.nightStart);
      setNightEndText(s.nightEnd);
      setPensionPercentText(String(s.pensionPercent));
      setPensionFreeAllowanceText(String(s.pensionFreeAllowancePerPeriod));
      setUnionFlatText(String(s.unionFlat));
      setDraftPatternStartDate(s.workPatternStartDate || "");
      setDraftPatternDays(s.workPatternDays || []);
    } catch (e) {
      console.error("reloadSettingsIntoForm error:", e);
    }
  }

  useEffect(() => { reloadSettingsIntoForm(); }, []);
  useEffect(() => { if (!defaultDeductBreak) setDefaultBreakMinutesText("0"); }, [defaultDeductBreak]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const baseRate = toNumber(baseRateText);
    const nightPremium = toNumber(nightPremiumText);
    const saturdayPremium = toNumber(saturdayPremiumText);
    const sundayPremium = toNumber(sundayPremiumText);
    const baseOvertimeThresholdHours = toNumber(baseOvertimeThresholdHoursText);
    const overtimeMultiplier = toNumber(overtimeMultiplierText);
    const extraShiftMultiplier = toNumber(extraShiftMultiplierText);
    const x2Multiplier = toNumber(x2MultiplierText);
    const nightOutAllowance = toNumber(nightOutAllowanceText);
    const defaultBreakMinutes = toInteger(defaultBreakMinutesText);

    if (!Number.isFinite(baseRate) || baseRate <= 0) errors.push("Base rate must be a number greater than 0.");
    if (!Number.isFinite(nightPremium) || nightPremium < 0) errors.push("Night premium must be 0 or more.");
    if (!Number.isFinite(saturdayPremium) || saturdayPremium < 0) errors.push("Saturday premium must be 0 or more.");
    if (!Number.isFinite(sundayPremium) || sundayPremium < 0) errors.push("Sunday premium must be 0 or more.");
    if (!Number.isFinite(baseOvertimeThresholdHours) || baseOvertimeThresholdHours < 0) errors.push("Base overtime threshold must be 0 or more.");
    if (!Number.isFinite(overtimeMultiplier) || overtimeMultiplier < 1) errors.push("Overtime multiplier must be at least 1.");
    if (!Number.isFinite(extraShiftMultiplier) || extraShiftMultiplier < 1) errors.push("Extra shift multiplier must be at least 1.");
    if (!Number.isFinite(x2Multiplier) || x2Multiplier < 1) errors.push("X2 multiplier must be at least 1.");
    if (!Number.isFinite(nightOutAllowance) || nightOutAllowance < 0) errors.push("Night out allowance must be 0 or more.");
    if (!taxCodeText.trim()) errors.push("Tax code cannot be empty.");
    if (!Number.isFinite(defaultBreakMinutes) || defaultBreakMinutes < 0 || defaultBreakMinutes > 720) errors.push("Default break minutes must be between 0 and 720.");
    if (defaultDeductBreak && defaultBreakMinutes <= 0) errors.push("Default break minutes must be greater than 0 when default unpaid break deduction is enabled.");

    // Cycle validare
    if (cycleMode === "payday_anchor") {
      if (!isValidEUDate(knownPaydayText)) {
        errors.push("Known payday must be a valid DD-MM-YYYY date.");
      } else {
        // Verificam ca e vineri
        const iso = euToISO(knownPaydayText);
        const dt = new Date(iso + "T00:00:00");
        if (dt.getDay() !== 5) errors.push("Known payday must be a Friday.");
      }
    } else {
      if (!isValidEUDate(cycleFirstDateText)) errors.push("Cycle first date must be a valid DD-MM-YYYY date.");
      if (!isValidEUDate(cycleLastDateText)) errors.push("Cycle last date must be a valid DD-MM-YYYY date.");
      if (isValidEUDate(cycleFirstDateText) && isValidEUDate(cycleLastDateText) &&
        new Date(euToISO(cycleLastDateText)).getTime() < new Date(euToISO(cycleFirstDateText)).getTime())
        errors.push("Cycle last date must be on or after cycle first date.");
      if (!isValidHHmm(cycleStartTimeText)) errors.push("Cycle start time must be in HH:mm format.");
      const paydayOffsetDays = toInteger(paydayOffsetDaysText);
      if (!Number.isFinite(paydayOffsetDays) || paydayOffsetDays < 0 || paydayOffsetDays > 31)
        errors.push("Payday offset must be between 0 and 31 days.");
    }

    if (!isValidEUDate(goodFridayText)) errors.push("Good Friday must be a valid DD-MM-YYYY date.");
    if (!isValidEUDate(easterMondayText)) errors.push("Easter Monday must be a valid DD-MM-YYYY date.");

    if (!isValidHHmm(nightStartText)) errors.push("Night premium start must be in HH:mm format.");
    if (!isValidHHmm(nightEndText)) errors.push("Night premium end must be in HH:mm format.");
    const pensionPercent = toNumber(pensionPercentText);
    const pensionFreeAllowance = toNumber(pensionFreeAllowanceText);
    const unionFlat = toNumber(unionFlatText);
    if (!Number.isFinite(pensionPercent) || pensionPercent < 0 || pensionPercent > 100) errors.push("Pension percent must be between 0 and 100.");
    if (!Number.isFinite(pensionFreeAllowance) || pensionFreeAllowance < 0) errors.push("Pension free allowance must be 0 or more.");
    if (!Number.isFinite(unionFlat) || unionFlat < 0) errors.push("Union fee must be 0 or more.");
    return errors;
  }, [baseRateText, nightPremiumText, saturdayPremiumText, sundayPremiumText,
    baseOvertimeThresholdHoursText, overtimeMultiplierText, extraShiftMultiplierText,
    x2MultiplierText, nightOutAllowanceText, taxCodeText, defaultDeductBreak,
    defaultBreakMinutesText, cycleMode, knownPaydayText, cycleLengthDaysValue,
    cycleFirstDateText, cycleLastDateText, cycleStartTimeText, paydayOffsetDaysText,
    goodFridayText, easterMondayText,
    nightStartText, nightEndText, pensionPercentText, pensionFreeAllowanceText, unionFlatText]);

  async function onSave() {
    if (!settings) return;
    if (validationErrors.length > 0) {
      setErrorList(validationErrors);
      setMsg("Please correct the errors below.");
      return;
    }
    try {
      const next: AppSettings = {
        ...settings,
        baseRate: toNumber(baseRateText),
        nightPremium: toNumber(nightPremiumText),
        saturdayPremium: toNumber(saturdayPremiumText),
        sundayPremium: toNumber(sundayPremiumText),
        overtimeThresholdHours: toNumber(baseOvertimeThresholdHoursText),
        baseOvertimeThresholdHours: toNumber(baseOvertimeThresholdHoursText),
        overtimeMultiplier: toNumber(overtimeMultiplierText),
        extraShiftMultiplier: toNumber(extraShiftMultiplierText),
        x2Multiplier: toNumber(x2MultiplierText),
        nightOutAllowance: toNumber(nightOutAllowanceText),
        taxCode: (taxCodeText || "").trim().toUpperCase(),
        defaultDeductBreak,
        defaultBreakMinutes: defaultDeductBreak ? toInteger(defaultBreakMinutesText) : 0,
        cycleType: cycleMode,
        // Mode 2
        knownPayday: euToISO(knownPaydayText),
        cycleLengthDays: cycleLengthDaysValue,
        // Mode 1
        cycleFirstDate: euToISO(cycleFirstDateText),
        cycleLastDate: euToISO(cycleLastDateText),
        cycleStartTime: cycleMode === "payday_anchor" ? "21:30" : cycleStartTimeText,
        cycleRepeats,
        cyclePatternText: "",
        paydayOffsetDays: toInteger(paydayOffsetDaysText),
        goodFriday: euToISO(goodFridayText),
        easterMonday: euToISO(easterMondayText),
        nightStart: nightStartText.trim(),
        nightEnd: nightEndText.trim(),
        pensionPercent: toNumber(pensionPercentText),
        pensionFreeAllowancePerPeriod: toNumber(pensionFreeAllowanceText),
        unionFlat: toNumber(unionFlatText),
        workPatternStartDate: draftPatternStartDate,
        workPatternDays: draftPatternDays,
      } as AppSettings;
      await saveSettings(next);
      setSettings(next);
      setErrorList([]);
      setMsg("Saved.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to save settings.";
      Alert.alert("Save failed", message);
    }
  }

  async function onExport() {
    try {
      setExportLoading(true);
      const daysRaw = await AsyncStorage.getItem(DAYS_KEY);
      const settingsRaw = await AsyncStorage.getItem(SETTINGS_KEY);
      const backup = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          [DAYS_KEY]: daysRaw ? JSON.parse(daysRaw) : {},
          [SETTINGS_KEY]: settingsRaw ? JSON.parse(settingsRaw) : {},
        },
      };
      const json = JSON.stringify(backup, null, 2);
      const fileUri = FileSystem.documentDirectory + getBackupFilename();
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: "utf8" });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/json", dialogTitle: "Save your WorkPayTracker backup", UTI: "public.json" });
      } else {
        Alert.alert("Export saved", `Backup saved to:\n${fileUri}`);
      }
    } catch (err: unknown) {
      Alert.alert("Export failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setExportLoading(false);
    }
  }

  async function onImport() {
    try {
      setImportLoading(true);
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled || !result.assets || result.assets.length === 0) { setImportLoading(false); return; }
      const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: "utf8" });
      let parsed: any;
      try { parsed = JSON.parse(raw); } catch { Alert.alert("Import failed", "The file is not valid JSON."); setImportLoading(false); return; }
      if (!parsed?.data || !parsed?.version) { Alert.alert("Import failed", "This file does not look like a WorkPayTracker backup."); setImportLoading(false); return; }
      Alert.alert("Restore backup?",
        `This will replace ALL current data with the backup from ${parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleDateString("en-GB") : "unknown date"}.\n\nThis cannot be undone.`,
        [{ text: "Cancel", style: "cancel", onPress: () => setImportLoading(false) },
         { text: "Restore", style: "destructive", onPress: async () => {
           try {
             if (parsed.data[DAYS_KEY]) await AsyncStorage.setItem(DAYS_KEY, JSON.stringify(parsed.data[DAYS_KEY]));
             if (parsed.data[SETTINGS_KEY]) await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed.data[SETTINGS_KEY]));
             await reloadSettingsIntoForm();
             Alert.alert("Restore complete", "All data has been restored from the backup.");
           } catch (err: unknown) { Alert.alert("Restore failed", err instanceof Error ? err.message : "Unknown error"); }
           finally { setImportLoading(false); }
         }}]);
    } catch (err: unknown) { Alert.alert("Import failed", err instanceof Error ? err.message : "Unknown error"); setImportLoading(false); }
  }

  // ── Work Pattern Editor ───────────────────────────────────────────────
  function onPatternDayTap(dateISO: string) {
    if (!draftPatternStartDate) {
      setDraftPatternStartDate(dateISO);
      setDraftPatternDays(["on"]);
      return;
    }
    const start = new Date(draftPatternStartDate + "T00:00:00");
    const target = new Date(dateISO + "T00:00:00");
    const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
    if (diff < 0) return;
    const newDays = [...draftPatternDays];
    if (diff < newDays.length) {
      newDays[diff] = newDays[diff] === "on" ? "off" : "on";
    } else {
      while (newDays.length <= diff) newDays.push("on");
    }
    setDraftPatternDays(newDays);
  }

  function getPatternCellStyle(dateISO: string) {
    if (!draftPatternStartDate) return null;
    const start = new Date(draftPatternStartDate + "T00:00:00");
    const target = new Date(dateISO + "T00:00:00");
    const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
    if (diff < 0 || diff >= draftPatternDays.length) return null;
    return draftPatternDays[diff] === "on"
      ? { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }
      : { backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" };
  }

  function renderPatternMonth() {
    const year = patternEditorMonth.getFullYear();
    const month = patternEditorMonth.getMonth();
    const daysInMonth = getDaysInMonth(patternEditorMonth);
    const firstDow = (getDay(new Date(year, month, 1)) + 6) % 7;
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <View>
        <View style={styles.patternWeekRow}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <Text key={d} style={styles.patternWeekday}>{d}</Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={styles.patternWeekRow}>
            {cells.slice(row * 7, row * 7 + 7).map((iso, col) => {
              if (!iso) return <View key={col} style={styles.patternCell} />;
              const cs = getPatternCellStyle(iso);
              const isStart = iso === draftPatternStartDate;
              const dayNum = parseInt(iso.split("-")[2], 10);
              return (
                <Pressable key={iso} onPress={() => onPatternDayTap(iso)}
                  style={[styles.patternCell, cs, isStart && styles.patternCellStart]}>
                  <Text style={[styles.patternCellNum, cs ? null : styles.patternCellNumDefault]}>{dayNum}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  const activeInfo = activeInfoKey ? FIELD_INFO[activeInfoKey] : null;
  function closeManualToCalendar() { setShowManual(false); router.replace("/(tabs)"); }

  const patternSummary = draftPatternDays.length > 0
    ? `${draftPatternDays.length}-day pattern · ${draftPatternDays.filter(d => d === "on").length} working · ${draftPatternDays.filter(d => d === "off").length} off`
    : "No pattern configured";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <MiniPauseBanner appName="WorkPayTracker" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}>
        <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 140 }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Settings</Text>

          {/* DATA BACKUP */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Data backup</Text>
            <Text style={styles.helpText}>Export saves all your shifts and settings to a JSON file. Import restores from a previously exported file. Always export before reinstalling.</Text>
            <View style={styles.backupRow}>
              <View style={styles.backupBtnWrap}>
                <PremiumButton label="Export Data" onPress={onExport} variant="secondary" loading={exportLoading} disabled={exportLoading || importLoading} icon={<Ionicons name="share-outline" size={16} color={D.goldLight} />} />
              </View>
              <View style={styles.backupBtnWrap}>
                <PremiumButton label="Import Data" onPress={onImport} variant="secondary" loading={importLoading} disabled={exportLoading || importLoading} icon={<Ionicons name="download-outline" size={16} color={D.goldLight} />} />
              </View>
            </View>
          </View>

          {/* PAY */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pay</Text>
            <Field label="Base rate (GBP/hour)" infoKey="baseRate" value={baseRateText} onChangeText={setBaseRateText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="12.21" />
            <Field label="Night premium" infoKey="nightPremium" value={nightPremiumText} onChangeText={setNightPremiumText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Night premium start (HH:mm)" infoKey="nightStart" value={nightStartText} onChangeText={setNightStartText} onOpenInfo={setActiveInfoKey} placeholder="18:00" />
            <Field label="Night premium end (HH:mm)" infoKey="nightEnd" value={nightEndText} onChangeText={setNightEndText} onOpenInfo={setActiveInfoKey} placeholder="06:00" />
            <Field label="Saturday premium" infoKey="saturdayPremium" value={saturdayPremiumText} onChangeText={setSaturdayPremiumText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Sunday premium" infoKey="sundayPremium" value={sundayPremiumText} onChangeText={setSundayPremiumText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="0.00" />
            <Field label="Base overtime threshold hours" infoKey="baseOvertimeThresholdHours" value={baseOvertimeThresholdHoursText} onChangeText={setBaseOvertimeThresholdHoursText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="160" />
            <Field label="Overtime multiplier" infoKey="overtimeMultiplier" value={overtimeMultiplierText} onChangeText={setOvertimeMultiplierText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="1.5" />
            <Field label="Extra shift multiplier" infoKey="extraShiftMultiplier" value={extraShiftMultiplierText} onChangeText={setExtraShiftMultiplierText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="1.5" />
            <Field label="X2 multiplier" infoKey="x2Multiplier" value={x2MultiplierText} onChangeText={setX2MultiplierText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="2" />
            <Field label="Night out allowance" infoKey="nightOutAllowance" value={nightOutAllowanceText} onChangeText={setNightOutAllowanceText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="0.00" />
          </View>

          {/* BREAK */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Default shift break behaviour</Text>
            <View style={styles.switchRow}>
              <InfoLabel label="Default unpaid break deduction" infoKey="defaultDeductBreak" onOpenInfo={setActiveInfoKey} />
              <PremiumSwitch value={defaultDeductBreak} onValueChange={setDefaultDeductBreak} />
            </View>
            <Field label="Default break minutes" infoKey="defaultBreakMinutes" value={defaultBreakMinutesText}
              onChangeText={setDefaultBreakMinutesText} onOpenInfo={setActiveInfoKey} keyboardType="numeric" placeholder="0" editable={defaultDeductBreak}
              helpText={defaultDeductBreak ? "Used as the default for new shifts." : "Disabled because default unpaid break deduction is off."} />
          </View>

          {/* HOLIDAY */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Holiday and Lieu rules</Text>
            <Text style={styles.helpText}>Holiday is paid as 10 hours at basic rate plus average shift premium over the last 52 weeks prior.</Text>
            <Text style={styles.helpText}>Lieu is paid as 10 hours at basic rate only.</Text>
            <Text style={styles.helpText}>Each Holiday or Lieu day reduces the overtime threshold by 10 hours in that cycle.</Text>
          </View>

          {/* TAX */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tax</Text>
            <Field label="Tax code" infoKey="taxCode" value={taxCodeText} onChangeText={setTaxCodeText} onOpenInfo={setActiveInfoKey} placeholder="1257L" />
          </View>

          {/* PENSION AND UNION */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Pension and union</Text>
            <Text style={styles.helpText}>Net pay subtracts pension and the union fee on top of PAYE and NI.</Text>
            <Field label="Pension percent (%)" infoKey="pensionPercent" value={pensionPercentText} onChangeText={setPensionPercentText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="5" />
            <Field label="Pension free allowance (per period)" infoKey="pensionFreeAllowancePerPeriod" value={pensionFreeAllowanceText} onChangeText={setPensionFreeAllowanceText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="480" />
            <Field label="Union fee (per period)" infoKey="unionFlat" value={unionFlatText} onChangeText={setUnionFlatText} onOpenInfo={setActiveInfoKey} keyboardType="decimal-pad" placeholder="0.00" />
          </View>

          {/* CYCLE ENGINE */}
          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.sectionTitle}>Pay Cycle Engine</Text>
              <Pressable onPress={() => setActiveInfoKey("cycleMode")} style={styles.infoBtn}>
                <Text style={styles.infoBtnText}>i</Text>
              </Pressable>
            </View>

            {/* Mode selector */}
            <View style={styles.modeSelectorRow}>
              <Pressable
                onPress={() => setCycleMode("payday_anchor")}
                style={[styles.modeBtn, cycleMode === "payday_anchor" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, cycleMode === "payday_anchor" && styles.modeBtnTextActive]}>
                  Payday anchor
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setCycleMode("custom_range")}
                style={[styles.modeBtn, cycleMode === "custom_range" && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, cycleMode === "custom_range" && styles.modeBtnTextActive]}>
                  Manual
                </Text>
              </Pressable>
            </View>

            {cycleMode === "payday_anchor" ? (
              <>
                <Text style={styles.helpText}>
                  Enter a known payday (must be a Friday) and your cycle length. The app will automatically derive all past and future cycles.
                </Text>
                <Text style={styles.helpText}>
                  Rule: cycle closes on the Sunday before payday at 21:30. Next payday is always the following Friday.
                </Text>
                <Field
                  label="Known payday (DD-MM-YYYY)"
                  infoKey="knownPayday"
                  value={knownPaydayText}
                  onChangeText={(t) => setKnownPaydayText(normalizeEUDate(t))}
                  onOpenInfo={setActiveInfoKey}
                  placeholder="06-02-2026"
                />
                <View style={styles.fieldWrap}>
                  <InfoLabel label="Cycle length" infoKey="cycleLengthDays" onOpenInfo={setActiveInfoKey} />
                  <CycleLengthSelector value={cycleLengthDaysValue} onChange={setCycleLengthDaysValue} />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.helpText}>
                  Define the cycle start and end dates manually. Payday is calculated from the cycle end plus the offset you set.
                </Text>
                <Field label="Cycle first date (DD-MM-YYYY)" infoKey="cycleFirstDate" value={cycleFirstDateText}
                  onChangeText={(t) => setCycleFirstDateText(normalizeEUDate(t))} onOpenInfo={setActiveInfoKey} placeholder="DD-MM-YYYY" />
                <Field label="Cycle last date (DD-MM-YYYY)" infoKey="cycleLastDate" value={cycleLastDateText}
                  onChangeText={(t) => setCycleLastDateText(normalizeEUDate(t))} onOpenInfo={setActiveInfoKey} placeholder="DD-MM-YYYY" />
                <Field label="Cycle start time (HH:mm)" infoKey="cycleStartTime" value={cycleStartTimeText}
                  onChangeText={setCycleStartTimeText} onOpenInfo={setActiveInfoKey} placeholder="21:30" />
                <View style={styles.switchRow}>
                  <InfoLabel label="Apply repetition" infoKey="cycleRepeats" onOpenInfo={setActiveInfoKey} />
                  <PremiumSwitch value={cycleRepeats} onValueChange={setCycleRepeats} />
                </View>
                <Field label="Payday offset after cycle end (days)" infoKey="paydayOffsetDays" value={paydayOffsetDaysText}
                  onChangeText={setPaydayOffsetDaysText} onOpenInfo={setActiveInfoKey} keyboardType="numeric" placeholder="5" />
              </>
            )}
          </View>

          {/* PUBLIC HOLIDAYS */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Public holidays</Text>
            <Field label="Good Friday (DD-MM-YYYY)" infoKey="goodFriday" value={goodFridayText}
              onChangeText={(t) => setGoodFridayText(normalizeEUDate(t))} onOpenInfo={setActiveInfoKey} placeholder="03-04-2026" />
            <Field label="Easter Monday (DD-MM-YYYY)" infoKey="easterMonday" value={easterMondayText}
              onChangeText={(t) => setEasterMondayText(normalizeEUDate(t))} onOpenInfo={setActiveInfoKey} placeholder="06-04-2026" />
          </View>

          {/* WORK PATTERN */}
          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.sectionTitle}>Work pattern</Text>
              <Pressable onPress={() => setActiveInfoKey("workPattern")} style={styles.infoBtn}>
                <Text style={styles.infoBtnText}>i</Text>
              </Pressable>
            </View>
            <Text style={styles.helpText}>{patternSummary}</Text>
            {draftPatternStartDate ? <Text style={styles.helpText}>Starts: {isoToEU(draftPatternStartDate)}</Text> : null}
            <View style={styles.backupRow}>
              <PremiumButton label="Configure Pattern" onPress={() => { setPatternEditorMonth(new Date()); setShowPatternEditor(true); }} variant="secondary" icon={<Ionicons name="calendar-outline" size={16} color={D.goldLight} />} />
              {draftPatternDays.length > 0 ? (
                <Pressable onPress={() => { setDraftPatternStartDate(""); setDraftPatternDays([]); }}
                  style={[styles.backupBtn, styles.backupBtnSecondary]}>
                  <Ionicons name="trash-outline" size={18} color="#991B1B" />
                  <Text style={[styles.backupBtnSecondaryText, { color: "#991B1B" }]}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {settings ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Settings currently used</Text>
              {([
                ["Base rate", `£${settings.baseRate}`],
                ["Night premium", `£${settings.nightPremium}`],
                ["Saturday premium", `£${settings.saturdayPremium}`],
                ["Sunday premium", `£${settings.sundayPremium}`],
                ["Night window", `${settings.nightStart}–${settings.nightEnd}`],
                ["Base overtime threshold", `${settings.baseOvertimeThresholdHours}h`],
                ["Overtime multiplier", `x${settings.overtimeMultiplier}`],
                ["Extra shift multiplier", `x${settings.extraShiftMultiplier}`],
                ["X2 multiplier", `x${settings.x2Multiplier}`],
                ["Night out allowance", `£${settings.nightOutAllowance}`],
                ["Pension percent", `${settings.pensionPercent}%`],
                ["Pension free allowance", `£${settings.pensionFreeAllowancePerPeriod}`],
                ["Union fee", `£${settings.unionFlat}`],
                ["Tax code", settings.taxCode],
                ["Cycle mode", settings.cycleType === "payday_anchor" ? "Payday anchor" : "Manual"],
                ["Cycle length", `${settings.cycleLengthDays} days`],
                ["Cycle start time", settings.cycleStartTime],
                ["Payday offset", `${settings.paydayOffsetDays} days`],
                ["Good Friday", isoToEU(settings.goodFriday)],
                ["Easter Monday", isoToEU(settings.easterMonday)],
              ] as Array<[string, string]>).map(([k, v]) => (
                <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
                  <Text style={{ color: "#111827", fontWeight: "700", flexShrink: 1, paddingRight: 8 }}>{k}</Text>
                  <Text style={{ color: "#374151", fontWeight: "700" }}>{v}</Text>
                </View>
              ))}
              <Text style={styles.helpText}>These are the values the app is using right now. Edit the fields above and Save to change them.</Text>
            </View>
          ) : null}

          {errorList.length > 0 ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Please fix these:</Text>
              {errorList.map((err, i) => <Text key={i} style={styles.errorItem}>• {err}</Text>)}
            </View>
          ) : null}
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}

          <PremiumButton label="Save Settings" onPress={onSave} variant="primary" />
          <PremiumButton label="APP Manual" onPress={() => setShowManual(true)} variant="ghost" />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* INFO MODAL */}
      <Modal visible={!!activeInfo} transparent animationType="fade" onRequestClose={() => setActiveInfoKey(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeInfo?.title}</Text>
              <Pressable onPress={() => setActiveInfoKey(null)}><Ionicons name="close" size={22} color="#111827" /></Pressable>
            </View>
            <Text style={styles.modalText}>{activeInfo?.text}</Text>
            <Pressable onPress={() => setActiveInfoKey(null)} style={styles.modalBtn}>
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MANUAL MODAL */}
      <Modal visible={showManual} animationType="slide" onRequestClose={closeManualToCalendar}>
        <SafeAreaView style={styles.manualSafe} edges={["top", "bottom"]}>
          <View style={styles.manualHeader}><Text style={styles.manualTitle}>APP Manual</Text></View>
          <ScrollView style={styles.manualScroll} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.manualText}>{APP_MANUAL_TEXT}</Text>
          </ScrollView>
          <View style={styles.manualFooter}>
            <Pressable onPress={closeManualToCalendar} style={styles.manualBackBtn}>
              <Text style={styles.manualBackBtnText}>Back to Calendar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* WORK PATTERN EDITOR MODAL */}
      <Modal visible={showPatternEditor} animationType="slide" onRequestClose={() => setShowPatternEditor(false)}>
        <SafeAreaView style={styles.manualSafe} edges={["top", "bottom"]}>
          <View style={styles.patternHeader}>
            <Text style={styles.patternHeaderTitle}>Configure Work Pattern</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
            <View style={styles.patternLegend}>
              <View style={styles.patternLegendItem}><View style={[styles.patternLegendDot, { backgroundColor: "#DCFCE7", borderColor: "#86EFAC" }]} /><Text style={styles.patternLegendText}>Working</Text></View>
              <View style={styles.patternLegendItem}><View style={[styles.patternLegendDot, { backgroundColor: "#F3F4F6", borderColor: "#D1D5DB" }]} /><Text style={styles.patternLegendText}>Off</Text></View>
              <View style={styles.patternLegendItem}><View style={[styles.patternLegendDot, { backgroundColor: "#FEF08A", borderColor: "#FDE047" }]} /><Text style={styles.patternLegendText}>Start</Text></View>
            </View>
            {!draftPatternStartDate
              ? <Text style={[styles.helpText, { textAlign: "center", marginBottom: 12 }]}>Tap the first day of your pattern to begin</Text>
              : <Text style={[styles.helpText, { textAlign: "center", marginBottom: 12 }]}>Tap days to toggle working / off. Tap beyond the last day to extend.</Text>}
            {draftPatternDays.length > 0 ? (
              <View style={styles.patternSummaryBar}>
                <Text style={styles.patternSummaryText}>{draftPatternDays.length} days · {draftPatternDays.filter(d => d === "on").length} working · {draftPatternDays.filter(d => d === "off").length} off</Text>
              </View>
            ) : null}
            <View style={styles.patternMonthNav}>
              <Pressable onPress={() => setPatternEditorMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()-1); return n; })} style={styles.patternNavBtn}>
                <Ionicons name="chevron-back" size={22} color="#111827" />
              </Pressable>
              <Text style={styles.patternMonthTitle}>{formatMonthTitle(patternEditorMonth)}</Text>
              <Pressable onPress={() => setPatternEditorMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()+1); return n; })} style={styles.patternNavBtn}>
                <Ionicons name="chevron-forward" size={22} color="#111827" />
              </Pressable>
            </View>
            {renderPatternMonth()}
          </ScrollView>
          <View style={styles.manualFooter}>
            <View style={styles.backupRow}>
              <Pressable onPress={() => { setDraftPatternStartDate(""); setDraftPatternDays([]); setShowPatternEditor(false); }}
                style={[styles.backupBtn, { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5" }]}>
                <Text style={[styles.backupBtnSecondaryText, { color: "#991B1B" }]}>Clear</Text>
              </Pressable>
              <Pressable onPress={() => setShowPatternEditor(false)} style={[styles.backupBtn, styles.backupBtnPrimary]}>
                <Text style={styles.backupBtnPrimaryText}>Save Pattern</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: BG_WARM },
  container: { padding: 12, backgroundColor: BG_WARM, gap: 12 },
  title: { fontSize: 22, fontWeight: "900", color: "#111827" },
  card: { borderWidth: 1, borderColor: BORDER_WARM, borderRadius: 14, padding: 12, backgroundColor: CARD_WARM },
  errorCard: { borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 14, padding: 12, backgroundColor: "#FEF2F2" },
  errorTitle: { fontSize: 15, fontWeight: "900", color: "#991B1B", marginBottom: 6 },
  errorItem: { color: "#991B1B", fontWeight: "700", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 8 },
  fieldWrap: { marginTop: 10 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 },
  label: { fontWeight: "900", color: "#111827", flexShrink: 1 },
  infoBtn: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: "#111827", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  infoBtnText: { fontSize: 11, fontWeight: "900", color: "#111827", lineHeight: 12 },
  helpText: { marginTop: 4, color: "#5A6070", fontWeight: "700", fontSize: 12 },
  input: { borderWidth: 1.5, borderColor: BORDER_WARM, borderRadius: 12, padding: 10, backgroundColor: "#FFFFFF", color: "#111827" },
  inputDisabled: { backgroundColor: "#F3F4F6", color: "#9CA3AF" },
  switchRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  msg: { color: "#22C55E", fontWeight: "900", marginTop: 4 },
  backupRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  backupBtnWrap: { flex: 1, minWidth: 0 },
  backupBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8 },
  backupBtnPrimary: { backgroundColor: "#111827" },
  backupBtnPrimaryText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  backupBtnSecondary: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER_WARM },
  backupBtnSecondaryText: { color: "#111827", fontWeight: "900", fontSize: 14 },
  // Cycle mode selector
  modeSelectorRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1.5, borderColor: BORDER_WARM, backgroundColor: "#FFFFFF" },
  modeBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  modeBtnText: { fontWeight: "900", color: "#111827", fontSize: 13 },
  modeBtnTextActive: { color: "#FFFBF2" },
  // Cycle length selector
  selectorRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  selectorBtn: { flex: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center", borderWidth: 1.5, borderColor: BORDER_WARM, backgroundColor: "#FFFFFF" },
  selectorBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  selectorBtnText: { fontWeight: "900", color: "#111827", fontSize: 13 },
  selectorBtnTextActive: { color: "#FFFBF2" },
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.35)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#FFF4E6", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER_WARM },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827", flex: 1, paddingRight: 10 },
  modalText: { marginTop: 10, color: "#6B7280", fontWeight: "700", lineHeight: 20 },
  modalBtn: { marginTop: 16, backgroundColor: "#111827", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalBtnText: { color: "#FFFBF2", fontWeight: "900" },
  manualSafe: { flex: 1, backgroundColor: "#FFFBF2" },
  manualHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER_WARM, backgroundColor: "#FFF4E6" },
  manualTitle: { fontSize: 22, fontWeight: "900", color: "#111827" },
  manualScroll: { flex: 1, backgroundColor: "#FFFBF2" },
  manualText: { color: "#6B7280", fontWeight: "700", lineHeight: 22 },
  manualFooter: { padding: 16, borderTopWidth: 1, borderTopColor: BORDER_WARM, backgroundColor: "#FFF4E6" },
  manualBackBtn: { backgroundColor: "#111827", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  manualBackBtnText: { color: "#FFFBF2", fontWeight: "900", fontSize: 16 },
  patternHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: BORDER_WARM, backgroundColor: CARD_WARM },
  patternHeaderTitle: { fontSize: 20, fontWeight: "900", color: "#111827" },
  patternLegend: { flexDirection: "row", gap: 16, justifyContent: "center", marginBottom: 8 },
  patternLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  patternLegendDot: { width: 14, height: 14, borderRadius: 3, borderWidth: 1 },
  patternLegendText: { fontSize: 12, fontWeight: "700", color: "#374151" },
  patternMonthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  patternNavBtn: { padding: 8 },
  patternMonthTitle: { fontSize: 17, fontWeight: "900", color: "#111827" },
  patternWeekRow: { flexDirection: "row", marginBottom: 2 },
  patternWeekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "900", color: "#6B7280", paddingVertical: 4 },
  patternCell: { flex: 1, aspectRatio: 1, margin: 2, borderRadius: 8, borderWidth: 1, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  patternCellStart: { borderColor: "#FDE047", backgroundColor: "#FEF08A" },
  patternCellNum: { fontSize: 13, fontWeight: "700", color: "#111827" },
  patternCellNumDefault: { color: "#9CA3AF" },
  patternSummaryBar: { backgroundColor: "#EFF6FF", borderRadius: 10, padding: 8, marginBottom: 8, alignItems: "center" },
  patternSummaryText: { fontSize: 13, fontWeight: "900", color: "#1D4ED8" },
});
