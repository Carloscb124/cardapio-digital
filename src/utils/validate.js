const { HttpError } = require('./http');

const DT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;

// schema: [{ name, label, type: str|int|dec|bool|enum|datetime|url, req, max, min, values, def, upper }]
function parse(body, schema) {
  const out = {};
  for (const f of schema) {
    const label = f.label || f.name;
    let v = body[f.name];
    if (f.type === 'bool') {
      out[f.name] = v === undefined ? (f.def ?? 0) : (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;
      continue;
    }
    if (v === undefined || v === null || v === '') {
      if (f.req) throw new HttpError(400, `${label} é obrigatório.`);
      out[f.name] = f.def !== undefined ? f.def : null;
      continue;
    }
    switch (f.type) {
      case 'str': {
        v = String(v).trim();
        if (f.upper) v = v.toUpperCase();
        if (!v && f.req) throw new HttpError(400, `${label} é obrigatório.`);
        if (v.length > (f.max || 255)) throw new HttpError(400, `${label} excede ${f.max || 255} caracteres.`);
        break;
      }
      case 'int': {
        v = Number(v);
        if (!Number.isInteger(v) || v < (f.min ?? 0) || v > 1e9) throw new HttpError(400, `${label} inválido.`);
        break;
      }
      case 'dec': {
        v = Number(v);
        if (!Number.isFinite(v) || v < (f.min ?? 0) || v > 99999999) throw new HttpError(400, `${label} inválido.`);
        v = Math.round(v * 100) / 100;
        break;
      }
      case 'enum': {
        if (!f.values.includes(v)) throw new HttpError(400, `${label} inválido.`);
        break;
      }
      case 'datetime': {
        v = String(v);
        if (!DT.test(v)) throw new HttpError(400, `${label} inválida.`);
        v = v.replace('T', ' '); if (v.length === 16) v += ':00';
        break;
      }
      case 'url': {
        v = String(v).trim();
        if (!/^(\/uploads\/[\w.-]+|https?:\/\/\S+)$/.test(v) || v.length > 255) throw new HttpError(400, `${label} inválida.`);
        break;
      }
      default: throw new Error('tipo desconhecido ' + f.type);
    }
    out[f.name] = v;
  }
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;
module.exports = { parse, round2 };
