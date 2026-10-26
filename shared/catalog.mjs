export function validateCatalogDocument(kind, raw) {
  const fail = () => { throw new Error('內容格式不符，請檢查必填欄位、日期、來源網址及長度。'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 24000) fail();
  const doc = structuredClone(raw);
  const string = (value, max = 5000, required = false) => {
    if (typeof value !== 'string' || value.length > max || required && !value.trim()) fail();
  };
  const sourced = item => { if (!item.source && !item.sourceNote) fail(); };
  const url = value => { if (!value) return; try { if (!['https:', 'http:'].includes(new URL(value).protocol)) fail(); } catch { fail(); } };
  function links(value, depth = 0) {
    if (depth > 8) fail();
    if (Array.isArray(value)) { if (value.length > 200) fail(); value.forEach(v => links(v, depth + 1)); }
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (['source', 'externalVideo', 'url'].includes(key)) { string(child, 2000); url(child); }
      else if (key === 'sources') { if (!Array.isArray(child)) fail(); child.forEach(url); }
      else links(child, depth + 1);
    }
    else if (typeof value === 'string' && value.length > 10000) fail();
  }
  if (kind === 'biography') {
    string(doc.biography, 5000, true); string(doc.biographyMore, 5000);
    if (!Array.isArray(doc.career) || doc.career.length > 100) fail();
    for (const item of doc.career) {
      string(item.label, 100, true); string(item.title, 200, true); string(item.description, 3000, true);
      if (!Number.isInteger(item.timelineOrder) || item.timelineOrder < 19770000 || item.timelineOrder > 30001231) fail();
      sourced(item);
    }
  } else if (kind === 'concert') {
    if (!Number.isSafeInteger(doc.id) || doc.id < 1) fail();
    string(doc.title, 300, true); string(doc.date, 10, true);
    if (!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(doc.date)) fail();
    if (doc.date.length === 10 && new Date(doc.date + 'T00:00:00Z').toISOString().slice(0, 10) !== doc.date) fail();
    if (!Number.isInteger(doc.year) || doc.year < 1977 || doc.year > 3000 || doc.year !== Number(doc.date.slice(0, 4))) fail();
    for (const key of ['ens', 'place', 'cond', 'story']) string(doc[key], key === 'story' ? 5000 : 500);
    for (const key of ['time','role','host','dateLabel','rowsNote','sourceName','sourceNote','imageLabel','asset','status']) if (doc[key] != null) string(doc[key], 2000);
    if (doc.timelineOrder != null && (!Number.isInteger(doc.timelineOrder) || doc.timelineOrder < 19770000 || doc.timelineOrder > 30001231)) fail();
    if (!Array.isArray(doc.rows) || doc.rows.length > 200) fail();
    for (const row of doc.rows) {
      if (!row || typeof row !== 'object') fail();
      for (const key of ['zh','orig','composer','arr']) if (row[key] != null) string(row[key], 500);
      if (!row.zh && !row.orig) fail();
    }
    sourced(doc);
    if (doc.videoIds && (!Array.isArray(doc.videoIds) || doc.videoIds.length > 10 || doc.videoIds.some(id => !/^[A-Za-z0-9_-]{11}$/.test(id)))) fail();
  } else fail();
  links(doc);
  return doc;
}
