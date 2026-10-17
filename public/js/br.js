// Utilidades de telefone (BR). DDDs válidos: manter igual ao de src/utils/br.js.
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
const phoneDigits = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d; };
const phoneOk = (d) => (d.length === 10 || d.length === 11) && DDDS.has(d.slice(0, 2)) && (d.length === 11 ? d[2] === '9' : /[2-5]/.test(d[2]));
function maskPhone(v) {
  const d = phoneDigits(v).slice(0, 11);
  if (d.length > 6) { const mid = d.length > 10 ? 5 : 4; return `(${d.slice(0, 2)}) ${d.slice(2, 2 + mid)}-${d.slice(2 + mid)}`; }
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d ? `(${d}` : '';
}
