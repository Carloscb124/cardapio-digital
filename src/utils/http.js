class HttpError extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseJson = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return null; } };
module.exports = { HttpError, wrap, parseJson };
