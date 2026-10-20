import AsyncStorage from "@react-native-async-storage/async-storage";

export type CycleType =
  | "custom_range"
  | "payday_anchor";

export type AppSettings = {
  // ── Pay rates ─────────────────────────────────────────────────────────
  baseRate: number;
  nightPremium: number;
  saturdayPremium: number;
  sundayPremium: number;

  // ── Night premium window (configurable) ───────────────────────────────
  nightStart: string;           // HH:mm — night premium starts
  nightEnd: string;             // HH:mm — night premium ends (next day if < start)

  // ── Statutory / payroll deductions for net estimate ───────────────────
  pensionPercent: number;                 // employee % on (gross - free allowance)
  pensionFreeAllowancePerPeriod: number;  // lower qualifying earnings per pay period
  unionFlat: number;                      // flat union fee per pay period

  overtimeThresholdHours: number;       // legacy alias — kept for pay.ts compatibility
  baseOvertimeThresholdHours: number;

  overtimeMultiplier: number;
  extraShiftMultiplier: number;
  x2Multiplier: number;

  nightOutAllowance: number;

  taxCode: string;

  // ── Cycle engine ───────────────────────────────────────────────────────
  cycleType: CycleType;

  // Mode 1 — Manual (custom_range)
  cycleFirstDate: string;       // ISO: first calendar day of the reference cycle
  cycleLastDate: string;        // ISO: last calendar day of the reference cycle
  cycleStartTime: string;       // HH:mm — time the cycle boundary occurs
  cycleRepeats: boolean;
  paydayOffsetDays: number;     // days after cycle-end-exclusive → payday

  // Mode 2 — Payday anchor (payday_anchor)
  knownPayday: string;          // ISO: a known payday date
  cycleLengthDays: number;      // 7 | 14 | 28

  // ── Public holidays ───────────────────────────────────────────────────
  goodFriday: string;
  easterMonday: string;

  // ── Work pattern visual overlay ───────────────────────────────────────
  workPatternStartDate: string;
  workPatternDays: string[];    // "on" | "off" per day

  // ── Default break behaviour ───────────────────────────────────────────
  defaultDeductBreak: boolean;
  defaultBreakMinutes: number;
};

const SETTINGS_KEY = "workpay_settings";

// Neutral example defaults. Users enter their own rates and pay cycle in Settings.
// Base rate = UK National Living Wage from April 2025.
export const DEFAULT_SETTINGS: AppSettings = {
  baseRate: 12.21,
  nightPremium: 0,
  saturdayPremium: 0,
  sundayPremium: 0,

  nightStart: "18:00",
  nightEnd: "06:00",

  pensionPercent: 5,
  pensionFreeAllowancePerPeriod: 480,
  unionFlat: 0,

  overtimeThresholdHours: 160,
  baseOvertimeThresholdHours: 160,

  overtimeMultiplier: 1.5,
  extraShiftMultiplier: 1.5,
  x2Multiplier: 2,

  nightOutAllowance: 0,

  taxCode: "1257L",

  cycleType: "payday_anchor",

  // Mode 1 — Manual
  cycleFirstDate: "2026-01-04",
  cycleLastDate: "2026-01-31",
  cycleStartTime: "21:30",
  cycleRepeats: true,
  paydayOffsetDays: 5,

  // Mode 2 — Payday anchor
  knownPayday: "2026-02-06",
  cycleLengthDays: 28,

  goodFriday: "2026-04-03",
  easterMonday: "2026-04-06",

  workPatternStartDate: "",
  workPatternDays: [],

  defaultDeductBreak: false,
  defaultBreakMinutes: 0,
};

// ── Sanitizers ────────────────────────────────────────────────────────────────

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeNumber(value: unknown, fallback: number, min = -999999, max = 999999): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeISODate(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function sanitizeTime(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s) ? s : fallback;
}

function sanitizeCycleType(value: unknown): CycleType {
  if (value === "custom_range") return "custom_range";
  return "payday_anchor";
}

function sanitizeCycleLengthDays(value: unknown): number {
  const n = Number(value);
  if (n === 7 || n === 14 || n === 28) return n;
  return 28;
}

function sanitizeSettings(input: Partial<AppSettings>): AppSettings {
  return {
    baseRate: sanitizeNumber(input.baseRate, DEFAULT_SETTINGS.baseRate, 0, 1000),
    nightPremium: sanitizeNumber(input.nightPremium, DEFAULT_SETTINGS.nightPremium, 0, 1000),
    saturdayPremium: sanitizeNumber(input.saturdayPremium, DEFAULT_SETTINGS.saturdayPremium, 0, 1000),
    sundayPremium: sanitizeNumber(input.sundayPremium, DEFAULT_SETTINGS.sundayPremium, 0, 1000),

    nightStart: sanitizeTime(input.nightStart, DEFAULT_SETTINGS.nightStart),
    nightEnd: sanitizeTime(input.nightEnd, DEFAULT_SETTINGS.nightEnd),

    pensionPercent: sanitizeNumber(input.pensionPercent, DEFAULT_SETTINGS.pensionPercent, 0, 100),
    pensionFreeAllowancePerPeriod: sanitizeNumber(input.pensionFreeAllowancePerPeriod, DEFAULT_SETTINGS.pensionFreeAllowancePerPeriod, 0, 100000),
    unionFlat: sanitizeNumber(input.unionFlat, DEFAULT_SETTINGS.unionFlat, 0, 10000),

    overtimeThresholdHours: clampInt(
      input.overtimeThresholdHours ?? input.baseOvertimeThresholdHours,
      DEFAULT_SETTINGS.overtimeThresholdHours,
      0, 500
    ),
    baseOvertimeThresholdHours: clampInt(
      input.baseOvertimeThresholdHours ?? input.overtimeThresholdHours,
      DEFAULT_SETTINGS.baseOvertimeThresholdHours,
      0, 500
    ),

    overtimeMultiplier: sanitizeNumber(input.overtimeMultiplier, DEFAULT_SETTINGS.overtimeMultiplier, 1, 10),
    extraShiftMultiplier: sanitizeNumber(input.extraShiftMultiplier, DEFAULT_SETTINGS.extraShiftMultiplier, 1, 10),
    x2Multiplier: sanitizeNumber(input.x2Multiplier, DEFAULT_SETTINGS.x2Multiplier, 1, 10),
    nightOutAllowance: sanitizeNumber(input.nightOutAllowance, DEFAULT_SETTINGS.nightOutAllowance, 0, 10000),

    taxCode: String(input.taxCode ?? DEFAULT_SETTINGS.taxCode).trim().toUpperCase(),

    cycleType: sanitizeCycleType(input.cycleType),

    cycleFirstDate: sanitizeISODate(input.cycleFirstDate, DEFAULT_SETTINGS.cycleFirstDate),
    cycleLastDate: sanitizeISODate(input.cycleLastDate, DEFAULT_SETTINGS.cycleLastDate),
    cycleStartTime: sanitizeTime(input.cycleStartTime, DEFAULT_SETTINGS.cycleStartTime),
    cycleRepeats: Boolean(input.cycleRepeats ?? DEFAULT_SETTINGS.cycleRepeats),
    paydayOffsetDays: clampInt(input.paydayOffsetDays, DEFAULT_SETTINGS.paydayOffsetDays, 0, 31),

    knownPayday: sanitizeISODate(input.knownPayday, DEFAULT_SETTINGS.knownPayday),
    cycleLengthDays: sanitizeCycleLengthDays(input.cycleLengthDays),

    goodFriday: sanitizeISODate(input.goodFriday, DEFAULT_SETTINGS.goodFriday),
    easterMonday: sanitizeISODate(input.easterMonday, DEFAULT_SETTINGS.easterMonday),

    workPatternStartDate: sanitizeISODate(input.workPatternStartDate, DEFAULT_SETTINGS.workPatternStartDate),
    workPatternDays: Array.isArray(input.workPatternDays)
      ? (input.workPatternDays as string[]).filter((d) => d === "on" || d === "off")
      : DEFAULT_SETTINGS.workPatternDays,

    defaultDeductBreak: Boolean(input.defaultDeductBreak ?? DEFAULT_SETTINGS.defaultDeductBreak),
    defaultBreakMinutes: clampInt(input.defaultBreakMinutes, DEFAULT_SETTINGS.defaultBreakMinutes, 0, 720),
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return sanitizeSettings(parsed);
  } catch (e) {
    console.error("Error loading settings", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    const clean = sanitizeSettings(settings);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch (e) {
    console.error("Error saving settings", e);
  }
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = sanitizeSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
}