const JST_OFFSET = 9 * 60; // UTC+9 in minutes

export function getJSTNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + JST_OFFSET * 60 * 1000);
}

export function getJSTToday(): string {
  const jst = getJSTNow();
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getJSTTomorrow(): string {
  const jst = getJSTNow();
  jst.setUTCDate(jst.getUTCDate() + 1);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
