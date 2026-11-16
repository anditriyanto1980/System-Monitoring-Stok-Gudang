/**
 * Date utilities formatted for Asia/Jakarta (WIB) timezone
 * Display format: DD/MM/YYYY
 * Storage format: YYYY-MM-DD
 */

export function getTodayWIB(): string {
  // Return YYYY-MM-DD in Asia/Jakarta time
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

export function formatWIBDateDisplay(isoDateStr: string | null | undefined): string {
  if (!isoDateStr) return '-';
  // Handle YYYY-MM-DD or ISO string
  const parts = isoDateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return isoDateStr;
}

export function formatWIBDateTimeDisplay(isoDateTimeStr: string | null | undefined): string {
  if (!isoDateTimeStr) return '-';
  try {
    const d = new Date(isoDateTimeStr);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d) + ' WIB';
  } catch {
    return isoDateTimeStr;
  }
}

export function parseDateInputToISO(displayOrInput: string): string {
  if (!displayOrInput) return getTodayWIB();
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(displayOrInput)) {
    return displayOrInput;
  }
  // If DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(displayOrInput)) {
    const [d, m, y] = displayOrInput.split('/');
    return `${y}-${m}-${d}`;
  }
  return displayOrInput;
}

export type PeriodFilter = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  label: string;
}

export function getDateRangeForPeriod(period: PeriodFilter, customStart?: string, customEnd?: string): DateRange {
  const todayStr = getTodayWIB();
  const [y, m, d] = todayStr.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));

  const toISODate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  switch (period) {
    case 'TODAY':
      return {
        startDate: todayStr,
        endDate: todayStr,
        label: `Hari Ini (${formatWIBDateDisplay(todayStr)})`,
      };
    case 'YESTERDAY': {
      const yesterday = new Date(today);
      yesterday.setUTCDate(today.getUTCDate() - 1);
      const yesterdayStr = toISODate(yesterday);
      return {
        startDate: yesterdayStr,
        endDate: yesterdayStr,
        label: `Kemarin (${formatWIBDateDisplay(yesterdayStr)})`,
      };
    }
    case 'THIS_WEEK': {
      // Senin sampai Minggu
      // day: 0 is Sunday, 1 is Monday ... 6 is Saturday
      const dayOfWeek = today.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      const start = toISODate(monday);
      const end = toISODate(sunday);
      return {
        startDate: start,
        endDate: end,
        label: `Minggu Ini (${formatWIBDateDisplay(start)} - ${formatWIBDateDisplay(end)})`,
      };
    }
    case 'THIS_MONTH': {
      const firstDay = new Date(Date.UTC(y, m - 1, 1));
      const lastDay = new Date(Date.UTC(y, m, 0));
      const start = toISODate(firstDay);
      const end = toISODate(lastDay);
      return {
        startDate: start,
        endDate: end,
        label: `Bulan Ini (${formatWIBDateDisplay(start)} - ${formatWIBDateDisplay(end)})`,
      };
    }
    case 'THIS_YEAR': {
      const firstDay = new Date(Date.UTC(y, 0, 1));
      const lastDay = new Date(Date.UTC(y, 11, 31));
      const start = toISODate(firstDay);
      const end = toISODate(lastDay);
      return {
        startDate: start,
        endDate: end,
        label: `Tahun Ini (${y})`,
      };
    }
    case 'CUSTOM':
    default: {
      const start = customStart || todayStr;
      const end = customEnd || todayStr;
      return {
        startDate: start,
        endDate: end,
        label: `${formatWIBDateDisplay(start)} - ${formatWIBDateDisplay(end)}`,
      };
    }
  }
}

/**
 * Subtract N days from a YYYY-MM-DD date string using UTC calendar math
 */
export function subtractDaysWIB(isoDateStr: string, days: number): string {
  const clean = (isoDateStr || getTodayWIB()).split('T')[0];
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return getTodayWIB();
  }
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate integer calendar day difference (toDate - fromDate) for YYYY-MM-DD strings
 */
export function diffDaysWIB(fromDateStr: string, toDateStr: string): number {
  const cleanFrom = (fromDateStr || '').split('T')[0];
  const cleanTo = (toDateStr || '').split('T')[0];
  const p1 = cleanFrom.split('-').map(Number);
  const p2 = cleanTo.split('-').map(Number);
  if (p1.length !== 3 || p2.length !== 3 || p1.some(isNaN) || p2.some(isNaN)) {
    return 0;
  }
  const d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

