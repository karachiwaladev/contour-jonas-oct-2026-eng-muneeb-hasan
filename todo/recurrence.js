// Date maths for recurring tasks. Dates are "YYYY-MM-DD" strings in local calendar terms.
// UTC is used internally only for day arithmetic, which avoids daylight-saving shifts.

export const REPEATS = ["none", "daily", "weekly", "monthly", "yearly"];
export const REPEAT_LABELS = { none: "Doesn't repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

function parse(date) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function format({ y, m, d }) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOf(date) {
  return parse(date).d;
}

// One step forward. anchorDay is the day of month the series started on, so a monthly
// task due on the 31st lands on the last day of shorter months and returns to the 31st after.
function step(date, repeat, anchorDay) {
  const { y, m, d } = parse(date);
  if (repeat === "daily" || repeat === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + (repeat === "daily" ? 1 : 7)));
    return format({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
  }
  if (repeat === "monthly") {
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return format({ y: ny, m: nm, d: Math.min(anchorDay, daysInMonth(ny, nm)) });
  }
  if (repeat === "yearly") {
    return format({ y: y + 1, m, d: Math.min(anchorDay, daysInMonth(y + 1, m)) });
  }
  throw new Error(`Unknown repeat: ${repeat}`);
}

// The next due date after `dueDate`, stepped forward until it's on or after `today`,
// so completing a long-overdue task creates one future occurrence, not a backlog.
export function nextDueDate(dueDate, repeat, today, anchorDay = dayOf(dueDate)) {
  let next = step(dueDate, repeat, anchorDay);
  while (next < today) next = step(next, repeat, anchorDay);
  return next;
}
