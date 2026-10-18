const crypto = require('crypto');
const multer = require('multer');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAGIC = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

// Em memória: a imagem é gravada no banco (a Vercel não tem disco persistente).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new Error('FORMATO'))),
});

// Confere os primeiros bytes (não confia só no mimetype enviado pelo navegador).
function hasValidMagic(file) {
  const b = file.buffer;
  if (!b || !MAGIC[file.mimetype].every((x, i) => b[i] === x)) return false;
  return file.mimetype !== 'image/webp' || b.subarray(8, 12).toString('latin1') === 'WEBP';
}
const newName = (mime) => crypto.randomBytes(16).toString('hex') + EXT[mime];
module.exports = { upload, hasValidMagic, newName };
