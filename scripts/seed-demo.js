// Cria um estabelecimento de DEMONSTRAÇÃO (slug "demo") com cardápio de exemplo.
// Não cria pedidos falsos. A senha do administrador é gerada aleatoriamente e mostrada uma única vez.
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');

(async () => {
  const [[ex]] = await db.query("SELECT id FROM establishments WHERE slug='demo'");
  if (ex) { console.log('O estabelecimento "demo" já existe. Nada foi alterado.'); return db.end(); }
  const pass = crypto.randomBytes(9).toString('base64url');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const hours = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(() => ({ closed: false, open: '00:00', close: '23:59' })));
    const [e] = await conn.query(
      "INSERT INTO establishments (slug,name,description,whatsapp,address,min_order,est_delivery_minutes,opening_hours) VALUES ('demo','Lanchonete Demo','Estabelecimento de demonstração do sistema.','5511999999999','Rua Exemplo, 100',15,40,?)", [hours]);
    const est = e.insertId;
    await conn.query("INSERT INTO users (establishment_id,name,email,password_hash,role) VALUES (?,?,?,?, 'admin')", [est, 'Admin Demo', 'admin@demo.local', await bcrypt.hash(pass, 12)]);
    const cat = async (n, o) => (await conn.query('INSERT INTO categories (establishment_id,name,sort_order) VALUES (?,?,?)', [est, n, o]))[0].insertId;
    const lanches = await cat('Lanches', 1), bebidas = await cat('Bebidas', 2);
    const prod = async (c, n, d, p, promo, track) => (await conn.query(
      'INSERT INTO products (establishment_id,category_id,name,description,price,promo_price,prep_minutes,track_stock,stock_qty,stock_min) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [est, c, n, d, p, promo, 20, track ? 1 : 0, track ? 30 : 0, track ? 5 : 0]))[0].insertId;
    const burger = await prod(lanches, 'X-Burger', 'Pão, hambúrguer 150g, queijo e salada', 24, 21.9, false);
    const chicken = await prod(lanches, 'X-Frango', 'Pão, frango grelhado, queijo e salada', 22, null, false);
    const refri = await prod(bebidas, 'Refrigerante lata', '350 ml', 6, null, true);
    const [g] = await conn.query('INSERT INTO option_groups (establishment_id,name,min_select,max_select) VALUES (?,?,0,3)', [est, 'Adicionais']);
    for (const [n, p] of [['Bacon', 4], ['Ovo', 3], ['Queijo extra', 3.5]]) await conn.query('INSERT INTO options (group_id,name,price_delta) VALUES (?,?,?)', [g.insertId, n, p]);
    const [t] = await conn.query('INSERT INTO option_groups (establishment_id,name,min_select,max_select) VALUES (?,?,1,1)', [est, 'Ponto da carne']);
    for (const n of ['Ao ponto', 'Bem passado']) await conn.query('INSERT INTO options (group_id,name,price_delta) VALUES (?,?,0)', [t.insertId, n]);
    await conn.query('INSERT INTO product_option_groups VALUES (?,?),(?,?),(?,?)', [burger, g.insertId, burger, t.insertId, chicken, g.insertId]);
    const [cb] = await conn.query('INSERT INTO combos (establishment_id,name,description,price) VALUES (?,?,?,?)', [est, 'X-Burger + Refri', 'Um X-Burger e um refrigerante', 26]);
    await conn.query('INSERT INTO combo_items VALUES (?,?,1),(?,?,1)', [cb.insertId, burger, cb.insertId, refri]);
    await conn.query("INSERT INTO delivery_zones (establishment_id,neighborhood,fee) VALUES (?, 'Centro', 5), (?, 'Jardim das Flores', 8)", [est, est]);
    await conn.query("INSERT INTO coupons (establishment_id,code,type,value,min_order,max_discount,max_uses) VALUES (?, 'BEMVINDO10','percent',10,30,10,100)", [est]);
    await conn.query("INSERT INTO stock_movements (establishment_id,product_id,delta,reason) VALUES (?,?,30,'Estoque inicial')", [est, refri]);
    await conn.commit();
    console.log('\nDemo criada.\n  Cardápio: http://localhost:' + (process.env.PORT || 3000) + '/m/demo\n  Painel:   admin@demo.local\n  Senha:    ' + pass + '\n(anote a senha: ela não será mostrada de novo)');
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); await db.end(); }
})().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
