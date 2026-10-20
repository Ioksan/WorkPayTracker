import { DayEntry, DayMap } from "../storage/calendarStorage";
import { AppSettings, DEFAULT_SETTINGS } from "../storage/settingsStorage";

export type PaySettings = AppSettings;

export type Segment = {
  start: Date;
  end: Date;
  hours: number;
  nightHours: number;
  saturdayHours: number;
  sundayHours: number;
  x2Hours: number;
};

export type CycleTotals = {
  daysCount: number;
  paidHours: number;
  gross: number;
  shiftHours: number;
  holidayHours: number;
  sickDays: number;
  extraShiftHours: number;
  overtimeHours: number;
  nightHours: number;
  saturdayHours: number;
  sundayHours: number;
  x2Hours: number;
  nightOutCount: number;
  nightPay: number;
  saturdayPay: number;
  sundayPay: number;
  x2BaseTopUpPay: number;
  // Gross breakdown in GBP (sums to gross) + lieu hours split out of holidayHours
  basicPay: number;
  overtimePay: number;
  holidayPay: number;
  lieuPay: number;
  lieuHours: number;
  nightOutPay: number;
};

export type NetEstimate = {
  gross: number;
  incomeTax: number;
  nationalInsurance: number;
  pension: number;
  union: number;
  net: number;
};

export type Totals = {
  daysCount: number;
  paidHours: number;
  gross: number;
  extraShiftHours: number;
  nightOutCount: number;
};

export type CycleBounds = {
  startISO: string;
  endISOInclusive: string;
  endISOExclusive: string;
  startDateTime: Date;
  endDateTimeExclusive: Date;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normaliseHHmm(input: string): string {
  const digits = (input || "").replace(/[^\d]/g, "");
  if (digits.length === 0) return "";

  let hh = 0;
  let mm = 0;

  if (digits.length <= 2) {
    hh = parseInt(digits, 10);
    mm = 0;
  } else {
    hh = parseInt(digits.slice(0, 2), 10);
    mm = parseInt(digits.slice(2, 4).padEnd(2, "0"), 10);
  }

  if (Number.isNaN(hh)) hh = 0;
  if (Number.isNaN(mm)) mm = 0;

  hh = clamp(hh, 0, 23);
  mm = clamp(mm, 0, 59);

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(hhmm: string): number {
  const n = normaliseHHmm(hhmm);
  if (!n) return 0;
  const [h, m] = n.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export function calcShiftHours(startHHmm: string, endHHmm: string): number {
  const startMin = hhmmToMinutes(startHHmm);
  const endMin = hhmmToMinutes(endHHmm);
  let diff = endMin - startMin;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function isoDateToLocal(dateISO: string): Date {
  const [y, m, d] = dateISO.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineDateAndTime(dateISO: string, hhmm: string): Date {
  const dt = isoDateToLocal(dateISO);
  const minutes = hhmmToMinutes(hhmm);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return dt;
}

function addDaysLocal(dt: Date, days: number): Date {
  const copy = new Date(dt);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonthsLocal(dt: Date, months: number): Date {
  const copy = new Date(dt);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function addDaysISO(dateISO: string, days: number): string {
  const dt = isoDateToLocal(dateISO);
  dt.setDate(dt.getDate() + days);
  return formatISODate(dt);
}

function hoursBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 3600000);
}

function isNightMinutes(mins: number, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  if (startMin > endMin) return mins >= startMin || mins < endMin; // window wraps midnight
  return mins >= startMin && mins < endMin;                        // same-day window
}

function getNightWindowMinutes(settings: PaySettings): { startMin: number; endMin: number } {
  return {
    startMin: hhmmToMinutes(settings.nightStart || "18:00"),
    endMin: hhmmToMinutes(settings.nightEnd || "06:00"),
  };
}

function isNightDateTime(dt: Date, settings: PaySettings): boolean {
  const mins = dt.getHours() * 60 + dt.getMinutes();
  const { startMin, endMin } = getNightWindowMinutes(settings);
  return isNightMinutes(mins, startMin, endMin);
}

function isSaturday(dt: Date): boolean {
  return dt.getDay() === 6;
}

function isSunday(dt: Date): boolean {
  return dt.getDay() === 0;
}

function monthDay(dateISO: string): string {
  return dateISO.slice(5);
}

function isCalendarDayX2(dateISO: string, settings: PaySettings): boolean {
  const md = monthDay(dateISO);
  if (md === "12-25") return true;
  if (md === "01-01") return true;
  if (settings.goodFriday && dateISO === settings.goodFriday) return true;
  if (settings.easterMonday && dateISO === settings.easterMonday) return true;
  return false;
}

function isFullShiftX2(entry: DayEntry): boolean {
  return monthDay(entry.date) === "12-26";
}

function getShiftStartEnd(entry: DayEntry): { start: Date; end: Date } | null {
  if (entry.data.type !== "shift" || !entry.data.shift) return null;
  const start = combineDateAndTime(entry.date, entry.data.shift.start);
  let end = combineDateAndTime(entry.date, entry.data.shift.end);
  if (end.getTime() <= start.getTime()) {
    end = addDaysLocal(end, 1);
  }
  return { start, end };
}

function getEntryEffectiveStart(entry: DayEntry): Date {
  if (entry.data.type === "shift" && entry.data.shift) {
    return combineDateAndTime(entry.date, entry.data.shift.start);
  }
  return combineDateAndTime(entry.date, "00:00");
}

function getSplitPoints(start: Date, end: Date, settings: PaySettings): Date[] {
  const { startMin, endMin } = getNightWindowMinutes(settings);
  const pts: Date[] = [start, end];
  const dayCursor = new Date(start);
  dayCursor.setHours(0, 0, 0, 0);

  while (dayCursor <= end) {
    const midnight = new Date(dayCursor);
    const nightStartPt = new Date(dayCursor);
    const nightEndPt = new Date(dayCursor);
    nightStartPt.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    nightEndPt.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (midnight > start && midnight < end) pts.push(midnight);
    if (nightEndPt > start && nightEndPt < end) pts.push(nightEndPt);
    if (nightStartPt > start && nightStartPt < end) pts.push(nightStartPt);
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  pts.sort((a, b) => a.getTime() - b.getTime());
  const uniq: Date[] = [];
  for (const p of pts) {
    if (!uniq.some((u) => u.getTime() === p.getTime())) uniq.push(p);
  }
  return uniq;
}

export function calcDayPaidHours(entry: DayEntry): number {
  const type = entry.data.type;
  if (type === "holiday" || type === "lieu") return 10;
  if (type === "sick") return 0;

  const shift = entry.data.shift;
  if (!shift) return 0;

  let hours = calcShiftHours(shift.start, shift.end);
  if (shift.deductBreak && shift.breakMinutes) {
    hours -= shift.breakMinutes / 60;
  }
  if (hours < 0) hours = 0;
  if (shift.min8h && hours > 0 && hours < 8) hours = 8;
  return hours;
}

function getSegmentsForShift(entry: DayEntry, settings: PaySettings): Segment[] {
  const window = getShiftStartEnd(entry);
  if (!window) return [];

  const rawHours = hoursBetween(window.start, window.end);
  if (rawHours <= 0) return [];

  const splitPoints = getSplitPoints(window.start, window.end, settings);
  const segments: Segment[] = [];

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const segStart = splitPoints[i];
    const segEnd = splitPoints[i + 1];
    const hours = hoursBetween(segStart, segEnd);
    if (hours <= 0) continue;

    const segDateISO = formatISODate(segStart);
    const nightHours = isNightDateTime(segStart, settings) ? hours : 0;
    const saturdayHours = isSaturday(segStart) ? hours : 0;
    const sundayHours = isSunday(segStart) ? hours : 0;

    let x2Hours = 0;
    if (isFullShiftX2(entry)) {
      x2Hours = hours;
    } else if (isCalendarDayX2(segDateISO, settings)) {
      x2Hours = hours;
    }

    segments.push({ start: segStart, end: segEnd, hours, nightHours, saturdayHours, sundayHours, x2Hours });
  }

  const finalPaidHours = calcDayPaidHours(entry);
  if (rawHours > 0 && finalPaidHours > 0 && rawHours !== finalPaidHours) {
    const factor = finalPaidHours / rawHours;
    for (const seg of segments) {
      seg.hours *= factor;
      seg.nightHours *= factor;
      seg.saturdayHours *= factor;
      seg.sundayHours *= factor;
      seg.x2Hours *= factor;
    }
  }

  return segments;
}

function getEntryNightOut(entry: DayEntry): boolean {
  return entry.data.type === "shift" && !!entry.data.shift?.nightOut;
}

function getEntryExtraShift(entry: DayEntry): boolean {
  return entry.data.type === "shift" && !!entry.data.shift?.extraShift;
}

function getSettingsLike(baseRate: number, nightOutAllowance = DEFAULT_SETTINGS.nightOutAllowance): PaySettings {
  return { ...DEFAULT_SETTINGS, baseRate, nightOutAllowance };
}

function getPremiumPayForShift(entry: DayEntry, settings: PaySettings): number {
  const segments = getSegmentsForShift(entry, settings);
  let total = 0;
  for (const seg of segments) {
    total += seg.nightHours * settings.nightPremium;
    total += seg.saturdayHours * settings.saturdayPremium;
    total += seg.sundayHours * settings.sundayPremium;
  }
  return round2(total);
}

export function getAveragePremiumRateLast52WeeksBefore(
  targetDateISO: string,
  settings: PaySettings,
  allEntries: DayEntry[]
): number {
  const target = isoDateToLocal(targetDateISO);
  const start = addDaysLocal(target, -364);
  let totalPremiumPay = 0;
  let totalShiftHours = 0;

  for (const entry of allEntries) {
    if (entry.data.type !== "shift") continue;
    const effectiveStart = getEntryEffectiveStart(entry);
    if (effectiveStart < start || effectiveStart >= target) continue;
    totalPremiumPay += getPremiumPayForShift(entry, settings);
    totalShiftHours += calcDayPaidHours(entry);
  }

  if (totalShiftHours <= 0) return 0;
  return round2(totalPremiumPay / totalShiftHours);
}

export function calcDayGross(entry: DayEntry, baseRate: number, nightOutAllowance = DEFAULT_SETTINGS.nightOutAllowance): number {
  const settings = getSettingsLike(baseRate, nightOutAllowance);
  return calcDayGrossWithSettings(entry, settings, []);
}

export function calcDayGrossWithSettings(entry: DayEntry, settings: PaySettings, allEntries: DayEntry[] = []): number {
  const type = entry.data.type;

  if (type === "lieu") return round2(10 * settings.baseRate);

  if (type === "holiday") {
    const avgPremiumRate = getAveragePremiumRateLast52WeeksBefore(entry.date, settings, allEntries);
    return round2(10 * (settings.baseRate + avgPremiumRate));
  }

  if (type === "sick") return 0;

  const shift = entry.data.shift;
  if (!shift) return 0;

  const segments = getSegmentsForShift(entry, settings);
  let total = 0;

  for (const seg of segments) {
    const isX2 = seg.x2Hours > 0;
    const baseMultiplier = isX2
      ? settings.x2Multiplier
      : shift.extraShift
        ? settings.extraShiftMultiplier
        : 1;

    const premiums =
      (seg.nightHours > 0 ? settings.nightPremium : 0) +
      (seg.saturdayHours > 0 ? settings.saturdayPremium : 0) +
      (seg.sundayHours > 0 ? settings.sundayPremium : 0);

    total += seg.hours * (settings.baseRate * baseMultiplier + premiums);
  }

  const rawHours = calcShiftHours(shift.start, shift.end);
  if (shift.nightOut && rawHours >= 15) {
    total += settings.nightOutAllowance;
  }

  return round2(total);
}

export function moneyGBP(n: number): string {
  return `£${round2(n).toFixed(2)}`;
}

export function moneyGBPShort(n: number): string {
  if (n <= 0) return "£0";
  if (n >= 1000) return `£${Math.round(n)}`;
  const oneDec = Math.round(n * 10) / 10;
  return `£${oneDec % 1 === 0 ? Math.round(oneDec) : oneDec}`;
}

export function calcTotalsForDates(entries: DayEntry[], baseRate: number, nightOutAllowance = DEFAULT_SETTINGS.nightOutAllowance): Totals {
  let daysCount = 0, paidHours = 0, gross = 0, extraShiftHours = 0, nightOutCount = 0;
  for (const e of entries) {
    daysCount += 1;
    const h = calcDayPaidHours(e);
    paidHours += h;
    gross += calcDayGross(e, baseRate, nightOutAllowance);
    if (getEntryExtraShift(e)) extraShiftHours += h;
    if (getEntryNightOut(e)) nightOutCount += 1;
  }
  return { daysCount, paidHours: round2(paidHours), gross: round2(gross), extraShiftHours: round2(extraShiftHours), nightOutCount };
}

export function calcTotalsForDatesWithSettings(entries: DayEntry[], settings: PaySettings, allEntries: DayEntry[] = []): Totals {
  let daysCount = 0, paidHours = 0, gross = 0, extraShiftHours = 0, nightOutCount = 0;
  for (const e of entries) {
    daysCount += 1;
    const h = calcDayPaidHours(e);
    paidHours += h;
    gross += calcDayGrossWithSettings(e, settings, allEntries);
    if (getEntryExtraShift(e)) extraShiftHours += h;
    if (getEntryNightOut(e)) nightOutCount += 1;
  }
  return { daysCount, paidHours: round2(paidHours), gross: round2(gross), extraShiftHours: round2(extraShiftHours), nightOutCount };
}

export function getBaseOvertimeThreshold(settings: PaySettings): number {
  return Math.max(
    0,
    Number.isFinite(settings.baseOvertimeThresholdHours)
      ? settings.baseOvertimeThresholdHours
      : settings.overtimeThresholdHours
  );
}

export function getAdjustedOvertimeThreshold(entries: DayEntry[], settings: PaySettings): number {
  const holidayOrLieuDays = entries.filter((e) => e.data.type === "holiday" || e.data.type === "lieu").length;
  return Math.max(0, getBaseOvertimeThreshold(settings) - holidayOrLieuDays * 10);
}

export function calcCycleTotals(entries: DayEntry[], settings: PaySettings, allEntries: DayEntry[] = []): CycleTotals {
  const adjustedThreshold = getAdjustedOvertimeThreshold(entries, settings);

  const totals: CycleTotals = {
    daysCount: entries.length, paidHours: 0, gross: 0, shiftHours: 0, holidayHours: 0,
    sickDays: 0, extraShiftHours: 0, overtimeHours: 0, nightHours: 0, saturdayHours: 0,
    sundayHours: 0, x2Hours: 0, nightOutCount: 0, nightPay: 0, saturdayPay: 0,
    sundayPay: 0, x2BaseTopUpPay: 0,
    basicPay: 0, overtimePay: 0, holidayPay: 0, lieuPay: 0, lieuHours: 0, nightOutPay: 0,
  };

  for (const entry of entries) {
    if (entry.data.type === "holiday" || entry.data.type === "lieu") {
      const dayGross = calcDayGrossWithSettings(entry, settings, allEntries);
      totals.holidayHours += 10;
      totals.paidHours += 10;
      totals.gross += dayGross;
      if (entry.data.type === "lieu") {
        totals.lieuHours += 10;
        totals.lieuPay += dayGross;
      } else {
        totals.holidayPay += dayGross;
      }
      continue;
    }

    if (entry.data.type === "sick") {
      totals.sickDays += 1;
      continue;
    }

    const shift = entry.data.shift;
    if (!shift) continue;

    const segments = getSegmentsForShift(entry, settings);
    const rawShiftHours = calcDayPaidHours(entry);

    if (getEntryExtraShift(entry)) totals.extraShiftHours += rawShiftHours;

    let countedShiftHours = 0;

    for (const seg of segments) {
      let remaining = seg.hours;

      while (remaining > 0.000001) {
        const hoursAlreadyCounted = totals.shiftHours + countedShiftHours;
        const regularHoursLeft = Math.max(0, adjustedThreshold - hoursAlreadyCounted);
        const chunkHours = regularHoursLeft > 0 ? Math.min(remaining, regularHoursLeft) : remaining;

        const isX2 = seg.x2Hours > 0;
        const premiums =
          (seg.nightHours > 0 ? settings.nightPremium : 0) +
          (seg.saturdayHours > 0 ? settings.saturdayPremium : 0) +
          (seg.sundayHours > 0 ? settings.sundayPremium : 0);

        let baseMultiplier = 1;
        if (isX2) {
          baseMultiplier = settings.x2Multiplier;
        } else if (hoursAlreadyCounted >= adjustedThreshold) {
          baseMultiplier = settings.overtimeMultiplier;
        } else if (shift.extraShift) {
          baseMultiplier = settings.extraShiftMultiplier;
        }

        totals.gross += chunkHours * (settings.baseRate * baseMultiplier + premiums);
        totals.paidHours += chunkHours;

        const chunkBasePay = chunkHours * settings.baseRate * baseMultiplier;
        if (baseMultiplier === 1) {
          totals.basicPay += chunkBasePay;
        } else {
          totals.overtimePay += chunkBasePay;
        }

        if (!isX2 && hoursAlreadyCounted >= adjustedThreshold) {
          totals.overtimeHours += chunkHours;
        }

        const ratio = seg.hours > 0 ? chunkHours / seg.hours : 0;
        totals.nightHours += seg.nightHours * ratio;
        totals.saturdayHours += seg.saturdayHours * ratio;
        totals.sundayHours += seg.sundayHours * ratio;
        totals.x2Hours += seg.x2Hours * ratio;
        totals.nightPay += seg.nightHours * ratio * settings.nightPremium;
        totals.saturdayPay += seg.saturdayHours * ratio * settings.saturdayPremium;
        totals.sundayPay += seg.sundayHours * ratio * settings.sundayPremium;
        totals.x2BaseTopUpPay += seg.x2Hours * ratio * settings.baseRate * (settings.x2Multiplier - 1);

        countedShiftHours += chunkHours;
        remaining -= chunkHours;
      }
    }

    totals.shiftHours += rawShiftHours;

    const rawHours = calcShiftHours(shift.start, shift.end);
    if (shift.nightOut && rawHours >= 15) {
      totals.gross += settings.nightOutAllowance;
      totals.nightOutCount += 1;
      totals.nightOutPay += settings.nightOutAllowance;
    }
  }

  totals.paidHours = round2(totals.paidHours);
  totals.gross = round2(totals.gross);
  totals.shiftHours = round2(totals.shiftHours);
  totals.holidayHours = round2(totals.holidayHours);
  totals.extraShiftHours = round2(totals.extraShiftHours);
  totals.overtimeHours = round2(totals.overtimeHours);
  totals.nightHours = round2(totals.nightHours);
  totals.saturdayHours = round2(totals.saturdayHours);
  totals.sundayHours = round2(totals.sundayHours);
  totals.x2Hours = round2(totals.x2Hours);
  totals.nightPay = round2(totals.nightPay);
  totals.saturdayPay = round2(totals.saturdayPay);
  totals.sundayPay = round2(totals.sundayPay);
  totals.x2BaseTopUpPay = round2(totals.x2BaseTopUpPay);

  totals.basicPay = round2(totals.basicPay);
  totals.overtimePay = round2(totals.overtimePay);
  totals.holidayPay = round2(totals.holidayPay);
  totals.lieuPay = round2(totals.lieuPay);
  totals.lieuHours = round2(totals.lieuHours);
  totals.nightOutPay = round2(totals.nightOutPay);

  return totals;
}

// ── Legacy cycle helpers (kept for internal compatibility) ─────────────────────

function daysInMonthLocal(year: number, monthIndexZeroBased: number): number {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate();
}

function getMonthlyAnchor(year: number, monthIndexZeroBased: number, startDayOfMonth: number): Date {
  const maxDay = daysInMonthLocal(year, monthIndexZeroBased);
  const safeDay = Math.min(Math.max(1, startDayOfMonth), maxDay);
  return new Date(year, monthIndexZeroBased, safeDay, 0, 0, 0, 0);
}

function getMonthlyCycleStartForDate(dateISO: string, startDayOfMonth: number): string {
  const target = isoDateToLocal(dateISO);
  let candidate = getMonthlyAnchor(target.getFullYear(), target.getMonth(), startDayOfMonth);
  if (target < candidate) {
    const previousMonth = addMonthsLocal(candidate, -1);
    candidate = getMonthlyAnchor(previousMonth.getFullYear(), previousMonth.getMonth(), startDayOfMonth);
  }
  return formatISODate(candidate);
}

function getMonthlyCycleEndExclusive(startISO: string, startDayOfMonth: number): string {
  const start = isoDateToLocal(startISO);
  const nextMonth = addMonthsLocal(start, 1);
  const nextStart = getMonthlyAnchor(nextMonth.getFullYear(), nextMonth.getMonth(), startDayOfMonth);
  return formatISODate(nextStart);
}

function getFixedCycleEndExclusive(startISO: string, cycleLengthDays: number): string {
  return addDaysISO(startISO, Math.max(1, Math.round(cycleLengthDays || 28)));
}

function getWeeklyPatternCycleEndExclusive(startISO: string, settings: PaySettings): string {
  const weeks = Math.max(1, Math.round((settings as any).cycleLengthWeeks || 4));
  return addDaysISO(startISO, weeks * 7);
}

function getWeeklyPatternCycleStartForDate(dateISO: string, settings: PaySettings): string {
  const targetDateTime = combineDateAndTime(dateISO, settings.cycleStartTime || "00:00");
  const anchorDate = (settings as any).cycleAnchorDate || (settings as any).cycleStartDate || settings.cycleFirstDate;
  const anchor = combineDateAndTime(anchorDate, settings.cycleStartTime || "00:00");
  const cycleLengthDays = Math.max(1, Math.round((settings as any).cycleLengthWeeks || 4)) * 7;
  let cursor = new Date(anchor);

  while (targetDateTime < cursor) cursor = addDaysLocal(cursor, -cycleLengthDays);
  while (targetDateTime >= addDaysLocal(cursor, cycleLengthDays)) cursor = addDaysLocal(cursor, cycleLengthDays);

  return formatISODate(cursor);
}

function getCustomRangeLengthDays(settings: PaySettings): number {
  const da = isoDateToLocal(settings.cycleFirstDate);
  const db = isoDateToLocal(settings.cycleLastDate);
  return Math.max(1, Math.round((db.getTime() - da.getTime()) / 86400000));
}

function getCustomRangeCycleStartForDate(dateISO: string, settings: PaySettings): string {
  const anchor = isoDateToLocal(settings.cycleFirstDate);
  const target = isoDateToLocal(dateISO);
  const span = getCustomRangeLengthDays(settings);

  if (!settings.cycleRepeats) return formatISODate(anchor);

  let cursor = new Date(anchor);
  while (target < cursor) cursor = addDaysLocal(cursor, -span);
  while (target >= addDaysLocal(cursor, span)) cursor = addDaysLocal(cursor, span);

  return formatISODate(cursor);
}

function getCustomRangeCycleEndExclusive(startISO: string, settings: PaySettings): string {
  return addDaysISO(startISO, getCustomRangeLengthDays(settings));
}

// ── PAYDAY ANCHOR ─────────────────────────────────────────────────────────────

function getPaydayAnchorRefEndExclusive(settings: PaySettings): string {
  // Closing Sunday = knownPayday - 5 days
  const paydayDt = isoDateToLocal(settings.knownPayday);
  const sundayClose = new Date(paydayDt);
  sundayClose.setDate(sundayClose.getDate() - 5);
  return formatISODate(sundayClose);
}

function getPaydayAnchorCycleStartForDate(dateISO: string, settings: PaySettings): string {
  const cycleLengthDays = Math.max(7, settings.cycleLengthDays || 28);
  const cycleStartTime = settings.cycleStartTime || "21:30";
  const targetDateTime = combineDateAndTime(dateISO, cycleStartTime);
  let endExclusive = isoDateToLocal(getPaydayAnchorRefEndExclusive(settings));

  for (let i = 0; i < 500; i++) {
    const startDt = new Date(endExclusive);
    startDt.setDate(startDt.getDate() - cycleLengthDays);
    const startDateTime = combineDateAndTime(formatISODate(startDt), cycleStartTime);
    const endDateTime = combineDateAndTime(formatISODate(endExclusive), cycleStartTime);

    if (targetDateTime >= startDateTime && targetDateTime < endDateTime) {
      return formatISODate(startDt);
    }
    if (targetDateTime < startDateTime) {
      endExclusive = startDt;
    } else {
      const next = new Date(endExclusive);
      next.setDate(next.getDate() + cycleLengthDays);
      endExclusive = next;
    }
  }

  const startDt = new Date(endExclusive);
  startDt.setDate(startDt.getDate() - cycleLengthDays);
  return formatISODate(startDt);
}

function getPaydayAnchorCycleEndExclusive(cycleStartISO: string, settings: PaySettings): string {
  return addDaysISO(cycleStartISO, Math.max(7, settings.cycleLengthDays || 28));
}

function getPaydayAnchorPayday(cycleStartISO: string, settings: PaySettings): string {
  // endExclusive = closing Sunday → payday = +5 days = the following Friday
  const endExclusive = getPaydayAnchorCycleEndExclusive(cycleStartISO, settings);
  return addDaysISO(endExclusive, 5);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getCycleEndExclusive(cycleStartISO: string, settings: PaySettings): string {
  if (settings.cycleType === "payday_anchor") {
    return getPaydayAnchorCycleEndExclusive(cycleStartISO, settings);
  }
  if (settings.cycleType === "custom_range") {
    return getCustomRangeCycleEndExclusive(cycleStartISO, settings);
  }
  // Legacy
  if ((settings.cycleType as string) === "monthly") {
    return getMonthlyCycleEndExclusive(cycleStartISO, (settings as any).cycleStartDayOfMonth ?? 1);
  }
  if ((settings.cycleType as string) === "weekly_pattern") {
    return getWeeklyPatternCycleEndExclusive(cycleStartISO, settings);
  }
  return getFixedCycleEndExclusive(cycleStartISO, settings.cycleLengthDays);
}

export function getCycleBoundsForStart(cycleStartISO: string, settings: PaySettings): CycleBounds {
  const endISOExclusive = getCycleEndExclusive(cycleStartISO, settings);
  const endISOInclusive = addDaysISO(endISOExclusive, -1);
  return {
    startISO: cycleStartISO,
    endISOInclusive,
    endISOExclusive,
    startDateTime: combineDateAndTime(cycleStartISO, settings.cycleStartTime || "21:30"),
    endDateTimeExclusive: combineDateAndTime(endISOExclusive, settings.cycleStartTime || "21:30"),
  };
}

export function isDateInCycleRange(dateISO: string, cycleStartISO: string, settings: PaySettings): boolean {
  const bounds = getCycleBoundsForStart(cycleStartISO, settings);
  return dateISO >= bounds.startISO && dateISO <= bounds.endISOInclusive;
}

export function getCycleStartForDate(dateISO: string, settings: PaySettings): string {
  if (settings.cycleType === "payday_anchor") {
    return getPaydayAnchorCycleStartForDate(dateISO, settings);
  }
  if (settings.cycleType === "custom_range") {
    return getCustomRangeCycleStartForDate(dateISO, settings);
  }
  // Legacy
  if ((settings.cycleType as string) === "monthly") {
    return getMonthlyCycleStartForDate(dateISO, (settings as any).cycleStartDayOfMonth ?? 1);
  }
  if ((settings.cycleType as string) === "weekly_pattern") {
    return getWeeklyPatternCycleStartForDate(dateISO, settings);
  }
  const target = isoDateToLocal(dateISO);
  const cycleStart = isoDateToLocal((settings as any).cycleStartDate ?? settings.cycleFirstDate);
  let cursor = new Date(cycleStart);
  const safeLength = Math.max(1, Math.round(settings.cycleLengthDays || 28));
  while (target < cursor) cursor = addDaysLocal(cursor, -safeLength);
  while (target >= addDaysLocal(cursor, safeLength)) cursor = addDaysLocal(cursor, safeLength);
  return formatISODate(cursor);
}

export function getPaydayForCycleStart(cycleStartISO: string, settings: PaySettings): string {
  if (settings.cycleType === "payday_anchor") {
    return getPaydayAnchorPayday(cycleStartISO, settings);
  }
  // Mode 1: manual offset
  const { endISOExclusive } = getCycleBoundsForStart(cycleStartISO, settings);
  const payday = isoDateToLocal(endISOExclusive);
  payday.setDate(payday.getDate() + Math.max(0, Math.round(settings.paydayOffsetDays || 0)));
  return formatISODate(payday);
}

export function entriesForMonth(dayMap: DayMap, monthDate: Date): DayEntry[] {
  const y = monthDate.getFullYear();
  const m = String(monthDate.getMonth() + 1).padStart(2, "0");
  const prefix = `${y}-${m}-`;
  return Object.keys(dayMap).filter((k) => k.startsWith(prefix)).sort().map((k) => dayMap[k]).filter(Boolean);
}

export function entriesForCycle(dayMap: DayMap, cycleStartISO: string, settings?: PaySettings): DayEntry[] {
  const endISO = settings
    ? getCycleEndExclusive(cycleStartISO, settings)
    : addDaysISO(cycleStartISO, 28);

  if (!settings) {
    return Object.keys(dayMap).filter((k) => k >= cycleStartISO && k < endISO).sort().map((k) => dayMap[k]).filter(Boolean);
  }

  const cycleStartDateTime = combineDateAndTime(cycleStartISO, settings.cycleStartTime || "21:30");
  const cycleEndDateTime = combineDateAndTime(endISO, settings.cycleStartTime || "21:30");
  const endISOInclusive = addDaysISO(endISO, -1);

  return Object.keys(dayMap).sort().map((k) => dayMap[k]).filter(Boolean).filter((entry) => {
    // Timed shifts are assigned by their real start datetime. This keeps a night
    // shift starting at the 21:30 cycle boundary in the correct cycle.
    if (entry.data.type === "shift" && entry.data.shift) {
      const effectiveStart = getEntryEffectiveStart(entry);
      return effectiveStart >= cycleStartDateTime && effectiveStart < cycleEndDateTime;
    }
    // Date-only entries (holiday / lieu / sick) have no clock time, so they sit at
    // 00:00. Assign them by calendar date instead of the 21:30 datetime boundary,
    // otherwise an entry on the cycle's first day falls before 21:30 and is wrongly
    // pushed into the previous cycle.
    return entry.date >= cycleStartISO && entry.date <= endISOInclusive;
  });
}

export function parseCyclePatternTokens(patternText: string): string[] {
  return String(patternText || "").split(/[\n,;|]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

export function getPlannedPatternTokenForDate(dateISO: string, settings: PaySettings): string | null {
  const days = settings.workPatternDays;
  const startISO = settings.workPatternStartDate;

  if (days && days.length > 0 && startISO) {
    const start = isoDateToLocal(startISO);
    const target = isoDateToLocal(dateISO);
    const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
    if (diff < 0) return null;
    return days[diff % days.length] ?? null;
  }

  // Legacy cyclePatternText
  if (settings.cycleType !== "custom_range") return null;
  if (!settings.cycleRepeats) return null;
  const tokens = parseCyclePatternTokens((settings as any).cyclePatternText ?? "");
  if (tokens.length === 0) return null;
  const cycleStart = getCycleStartForDate(dateISO, settings);
  const start = isoDateToLocal(cycleStart);
  const target = isoDateToLocal(dateISO);
  const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
  if (diff < 0 || diff >= tokens.length) return null;
  return tokens[diff] ?? null;
}

export function getWorkPatternCycleIndex(dateISO: string, settings: PaySettings): number {
  const days = settings.workPatternDays;
  const startISO = settings.workPatternStartDate;
  if (!days || days.length === 0 || !startISO) return 0;
  const start = isoDateToLocal(startISO);
  const target = isoDateToLocal(dateISO);
  const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
  if (diff < 0) return 0;
  return Math.floor(diff / days.length);
}

export function isShiftOnPublicHoliday(entry: DayEntry, settings: PaySettings): boolean {
  if (entry.data.type !== "shift") return false;
  if (isFullShiftX2(entry)) return true;
  const segments = getSegmentsForShift(entry, settings);
  return segments.some((seg) => seg.x2Hours > 0);
}

function annualAllowanceFromTaxCode(taxCode: string): number {
  const code = (taxCode || "").toUpperCase().trim();
  if (code === "BR" || code === "D0" || code === "D1" || code === "0T" || code === "NT") return 0;
  const digits = code.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10) * 10;
}

export function estimateNetFromGross(gross: number, taxCode: string): NetEstimate {
  const code = (taxCode || "").toUpperCase().trim();
  const annualGross = gross * 13;
  const allowance = annualAllowanceFromTaxCode(code);

  let annualIncomeTax = 0;

  if (code === "NT") {
    annualIncomeTax = 0;
  } else if (code === "BR") {
    annualIncomeTax = annualGross * 0.2;
  } else if (code === "D0") {
    annualIncomeTax = annualGross * 0.4;
  } else if (code === "D1") {
    annualIncomeTax = annualGross * 0.45;
  } else {
    const taxable = Math.max(0, annualGross - allowance);
    const basicBand = 37700;
    const higherBandTop = 125140 - allowance;
    if (taxable <= basicBand) {
      annualIncomeTax = taxable * 0.2;
    } else if (taxable <= higherBandTop) {
      annualIncomeTax = basicBand * 0.2 + (taxable - basicBand) * 0.4;
    } else {
      annualIncomeTax = basicBand * 0.2 + (higherBandTop - basicBand) * 0.4 + (taxable - higherBandTop) * 0.45;
    }
  }

  const niThreshold4Weeks = 968;
  const niTaxable = Math.max(0, gross - niThreshold4Weeks);
  const nationalInsurance = niTaxable * 0.08;
  const incomeTax = annualIncomeTax / 13;
  const net = gross - incomeTax - nationalInsurance;

  return {
    gross: round2(gross),
    incomeTax: round2(incomeTax),
    nationalInsurance: round2(nationalInsurance),
    pension: 0,
    union: 0,
    net: round2(net),
  };
}

// Employee pension: percent applied to (gross - free allowance per period).
// Validated to the penny against five real UK payslips at 5% of (gross - 480).
export function estimatePension(gross: number, settings: PaySettings): number {
  const pct = Number.isFinite(settings.pensionPercent) ? settings.pensionPercent : 0;
  const free = Number.isFinite(settings.pensionFreeAllowancePerPeriod)
    ? settings.pensionFreeAllowancePerPeriod
    : 0;
  const base = Math.max(0, gross - free);
  return round2(base * (pct / 100));
}

// Net "B": gross minus PAYE, NI, pension and the flat union fee.
export function estimateNetFromGrossWithSettings(gross: number, settings: PaySettings): NetEstimate {
  const base = estimateNetFromGross(gross, settings.taxCode);
  const pension = estimatePension(gross, settings);
  const union = round2(Math.max(0, Number.isFinite(settings.unionFlat) ? settings.unionFlat : 0));
  const net = round2(gross - base.incomeTax - base.nationalInsurance - pension - union);

  return {
    gross: round2(gross),
    incomeTax: base.incomeTax,
    nationalInsurance: base.nationalInsurance,
    pension,
    union,
    net,
  };
}