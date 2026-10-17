// Escapa CSV e neutraliza "injeção de fórmula" (células iniciadas por = + - @).
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
module.exports = (header, rows) => '\uFEFF' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
