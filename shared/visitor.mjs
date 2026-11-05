// Visitor contributions are rebuilt from a fixed field list; unknown keys and links are never copied.
import { validateCatalogDocument } from './catalog.mjs';
export class VisitorInputError extends Error {}
const fail = () => { throw new VisitorInputError('INVALID_INPUT'); };
const text = (value, max, required = false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max) fail();
  const trimmed = value.trim();
  if (required && !trimmed) fail();
  return trimmed;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_ROWS = 50;
export const REPORT_TYPES = ['照片誤植', '資料錯誤', '要求移除照片或影片', '音樂會資料需要修正', '檢舉不適當內容'];
function rows(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_ROWS) fail();
  return value.map(row => {
    if (!row || typeof row !== 'object') fail();
    const clean = { zh: text(row.zh, 200), orig: text(row.orig, 200), composer: text(row.composer, 200), arr: text(row.arr, 200) };
    if (!clean.zh && !clean.orig) fail();
    return clean;
  });
}
// YYYY, YYYY-MM or YYYY-MM-DD; a missing month or day is never invented.
export function visitorDate(value) {
  const date = text(value, 10, true);
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(date)) fail();
  const year = Number(date.slice(0, 4));
  if (year < 1977 || year > 3000) fail();
  if (date.length === 10 && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) fail();
  return { date, year, timelineOrder: Number(date.replaceAll('-', '').padEnd(8, '0')) };
}
function envelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  if (!UUID.test(input.idempotencyKey)) throw new VisitorInputError('INVALID_IDEMPOTENCY_KEY');
  if (input.consent !== true) throw new VisitorInputError('CONSENT_REQUIRED');
  return { idempotencyKey: input.idempotencyKey, name: text(input.name, 200, true) };
}
export function validateVisitorConcert(input) {
  const base = envelope(input), when = visitorDate(input.date), dateNote = text(input.dateNote, 200);
  const partial = when.date.length < 10;
  const doc = {
    id: 1, origin: 'visitor', title: text(input.title, 300, true), ...when,
    ...(partial || dateNote ? { dateLabel: when.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1 年 $2 月 $3 日').replace(/^(\d{4})-(\d{2})$/, '$1 年 $2 月').replace(/^(\d{4})$/, '$1 年') + '（' + (dateNote || '演出日期待核對') + '）' } : {}),
    time: text(input.time, 20), place: text(input.place, 500), ens: text(input.ens, 500), cond: text(input.cond, 500), host: text(input.host, 500),
    story: text(input.story, 5000), rows: rows(input.rows), status: partial || dateNote ? 'date-pending' : '',
    need: true, asset: 'lu-portrait', imageLabel: '呂彥慶指揮資料照（非該場演出照片）',
    sourceName: '親友新增', sourceNote: '親友新增，尚未核對', contributor: base.name,
  };
  for (const key of ['time', 'host', 'status']) if (!doc[key]) delete doc[key];
  try { validateCatalogDocument('concert', doc); } catch { fail(); }
  return { idempotencyKey: base.idempotencyKey, document: doc };
}
export function validateSupplement(input) {
  const base = envelope(input);
  const targetId = text(input.concertId == null ? '' : String(input.concertId), 16, true);
  if (!/^[1-9]\d{0,15}$/.test(targetId)) fail();
  const body = { text: text(input.text, 2000), rows: rows(input.rows) };
  if (!body.text && !body.rows.length) fail();
  return { idempotencyKey: base.idempotencyKey, kind: 'supplement', targetKind: 'concert', targetId, name: base.name, body };
}
export function validateReport(input) {
  const base = envelope(input);
  const targetKind = input.targetKind;
  if (!['concert', 'memory', 'site'].includes(targetKind)) fail();
  const targetId = targetKind === 'site' ? 'general' : text(input.targetId == null ? '' : String(input.targetId), 64, true);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(targetId)) fail();
  if (!REPORT_TYPES.includes(input.type)) fail();
  const detail = text(input.detail, 2000, true);
  return { idempotencyKey: base.idempotencyKey, kind: 'report', targetKind, targetId, name: base.name, body: { type: input.type, detail, contact: text(input.contact, 200) } };
}
