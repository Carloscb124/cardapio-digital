// DDDs válidos no Brasil (manter igual ao de public/js/signup.js).
const DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

// Aceita com ou sem +55; devolve só os dígitos nacionais (DDD + número) ou null se inválido.
function nationalPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!DDDS.has(d.slice(0, 2))) return null;
  if (d.length === 11 && d[2] !== '9') return null; // celular começa com 9
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null; // fixo começa com 2 a 5
  return d;
}
module.exports = { DDDS, nationalPhone };
