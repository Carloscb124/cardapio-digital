// Gera a pasta exemplos/ (CSVs + ZIP modelo) a partir do pacote de exemplo. Uso: node scripts/build-examples.js
const fs = require('fs'); const path = require('path');
const { exampleFiles, exampleZip, placeholderPng } = require('../src/utils/example-package');
const dir = path.join(__dirname, '..', 'exemplos');
fs.mkdirSync(path.join(dir, 'imagens'), { recursive: true });
for (const [name, buf] of Object.entries(exampleFiles())) fs.writeFileSync(path.join(dir, name), buf);
fs.writeFileSync(path.join(dir, 'imagens', 'refrigerante.png'), placeholderPng());
fs.writeFileSync(path.join(dir, 'modelo-cardapio-csv.zip'), exampleZip());
console.log('Exemplos gerados em', dir);
