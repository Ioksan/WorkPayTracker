import AsyncStorage from "@react-native-async-storage/async-storage";

export type DayStatus = "worked" | "holiday" | "sick" | "off";
export type EntryType = "shift" | "holiday" | "lieu" | "sick" | "off";

export type ShiftData = {
  start: string;
  end: string;
  extraShift: boolean;
  min8h: boolean;
  nightOut: boolean;

  // NEW: unpaid break support
  deductBreak?: boolean;       // default false
  breakMinutes?: number;       // default 0
};

export type DayEntry = {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  data: {
    type: EntryType;
    shift?: ShiftData;
    notes?: string;
  };
};

export type DayMap = Record<string, DayEntry>;

const STORAGE_KEY = "workpay_days";

function normalizeShiftData(shift: ShiftData): ShiftData {
  return {
    ...shift,
    deductBreak: shift.deductBreak ?? false,
    breakMinutes: shift.breakMinutes ?? 0,
  };
}

function normalizeDayEntry(entry: DayEntry): DayEntry {
  if (entry.data.type === "shift" && entry.data.shift) {
    return {
      ...entry,
      data: {
        ...entry.data,
        shift: normalizeShiftData(entry.data.shift),
      },
    };
  }
  return entry;
}

export async function loadDays(): Promise<DayMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as DayMap;

    // normalize old data (important)
    const normalized: DayMap = {};
    for (const key in parsed) {
      normalized[key] = normalizeDayEntry(parsed[key]);
    }

    return normalized;
  } catch (err) {
    console.error("Error loading days", err);
    return {};
  }
}

export async function saveDays(dayMap: DayMap): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(dayMap));
  } catch (err) {
    console.error("Error saving days", err);
  }
}

export async function getDay(date: string): Promise<DayEntry | null> {
  const dayMap = await loadDays();
  return dayMap[date] ?? null;
}

export async function upsertDay(entry: DayEntry): Promise<void> {
  const dayMap = await loadDays();

  // ensure normalization before saving
  const normalized = normalizeDayEntry(entry);

  dayMap[entry.date] = normalized;
  await saveDays(dayMap);
}

export async function deleteDay(date: string): Promise<void> {
  const dayMap = await loadDays();
  delete dayMap[date];
  await saveDays(dayMap);
}