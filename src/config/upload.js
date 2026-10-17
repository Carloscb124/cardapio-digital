const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(DIR, { recursive: true });
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAGIC = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

const upload = multer({
  storage: multer.diskStorage({
    destination: DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[file.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new Error('FORMATO'))),
});

// Confere os primeiros bytes (não confia só no mimetype enviado pelo navegador).
function hasValidMagic(file) {
  const fd = fs.openSync(file.path, 'r'); const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0); fs.closeSync(fd);
  return MAGIC[file.mimetype].every((b, i) => buf[i] === b);
}
module.exports = { upload, hasValidMagic, DIR };
