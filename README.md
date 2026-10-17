# Cardápio Digital e Gestão de Pedidos

Sistema multiestabelecimento: cada loja tem painel administrativo e um cardápio público próprio (`/m/<link-da-loja>`).
Pedidos são **gravados no banco antes** de abrir o WhatsApp.

## Instalar no Windows

1. Instale o **Node.js LTS** (nodejs.org) e o **MySQL** (ou XAMPP/MariaDB). Deixe o MySQL rodando.
2. No PowerShell, dentro da pasta do projeto:
   ```
   npm install
   copy .env.example .env
   ```
3. Edite o `.env` (Bloco de Notas): `DB_USER`, `DB_PASSWORD` e `SESSION_SECRET`.
   Gerar segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Crie o banco e as tabelas: `npm run db:init`
5. Escolha uma das opções:
   - **Seu estabelecimento real:** `npm run create-admin` (a senha é digitada no terminal, não fica em arquivo).
   - **Demonstração:** `npm run seed:demo` cria a loja "demo" com cardápio de exemplo e **gera uma senha aleatória, mostrada uma única vez**. Não cria pedidos falsos.
6. Inicie: `npm start` → painel em http://localhost:3000 · cardápio em http://localhost:3000/m/demo

> Bootstrap, ícones e Chart.js vêm de CDN: o navegador precisa de internet.
> O horário de funcionamento usa o fuso do computador onde o servidor roda.

## Landing page e criação de conta
- `/` é a landing page; `/cadastro` é a criação de conta; `/login` é a entrada. Quem se cadastra já entra logado como administrador da nova loja, com o cardápio público em `/m/<endereço>`.
- **Validações (cliente e servidor):** nome (2–120), endereço do cardápio (3–40, minúsculas/números/hífen, sem hífen nas pontas ou repetido, palavras reservadas bloqueadas, checagem de disponibilidade ao digitar), WhatsApp com DDD válido e máscara, e-mail válido e único, senha (8+ com letra e número, lista de senhas comuns, confirmação), campo isca contra robôs, CSRF e limite de tentativas (`SIGNUP_RATE_LIMIT`, padrão 10 por hora por IP).
- O servidor repete todas as regras: a validação do navegador é só conforto de uso.
- Ainda **não há confirmação de e-mail** (exigiria SMTP) nem termos de uso. Antes de abrir cadastro ao público, inclua os termos e a política de privacidade revisados por quem entende do assunto.

## Perfis
| Perfil | Acesso |
|---|---|
| Administrador | Tudo do estabelecimento |
| Atendente | Resumo, pedidos, impressão de comandas |
| Cozinha | Apenas pedidos confirmados/em preparo (iniciar preparo → pronto) |

**Recuperar acesso:** Usuários → ícone de chave gera um link de uso único (1 hora) que o administrador entrega ao usuário. Não depende de e-mail/SMTP.

## O que o sistema faz
- **Cardápio:** categorias, produtos (preço, promoção, imagem, disponibilidade, tempo de preparo), grupos de opções/adicionais (mín./máx. de escolhas), combos.
- **Cardápio público:** busca, categorias, carrinho, adicionais, observações, retirada/entrega, cupom, mensagem formatada para o WhatsApp.
- **Regras validadas no servidor:** preços recalculados do banco (o navegador não define valores), horário de funcionamento, pausa, pedido mínimo, bairros/taxas, cupons (validade, limite, mínimo, teto), estoque, troco.
- **Pedidos:** aguardando → confirmado → preparo → pronto → saiu para entrega/concluído (ou cancelado). Cancelar devolve estoque e uso do cupom. Alerta sonoro e aviso de novos pedidos (ative "Som" no topo).
- **Estoque:** lançamentos de entrada/saída, histórico, alerta de estoque baixo.
- **Relatórios:** vendas por dia/semana/mês, ticket médio, mais vendidos, pagamentos, cancelados, exportação CSV (protegida contra injeção de fórmulas).
- **Comanda:** `/print/<id>` otimizada para térmica 58/80 mm.

## Impressão automática (futuro)
`GET /api/orders/:id/ticket` retorna a comanda em JSON + texto de 32 colunas (`src/services/ticket.service.js`).
Um serviço local futuro (ex.: pequeno programa Node na máquina do caixa) pode consultar essa rota autenticada e enviar à impressora, sem extensão de navegador.

## Estrutura
`src/routes` → `src/controllers` → `src/services` → `src/config/db.js` · `src/middleware/auth.js` (sessão, perfis, CSRF) · `database/schema.sql` · `views/` e `public/` (telas) · `uploads/` (imagens) · `test/`

## Segurança aplicada
bcrypt; consultas parametrizadas; sessão HttpOnly + SameSite=Strict; CSRF em toda escrita; limite de tentativas (login, redefinição, pedidos públicos); Helmet/CSP; isolamento por `establishment_id` em toda consulta; upload só JPG/PNG/WebP com conferência dos primeiros bytes, nome aleatório e limite de 2 MB; credenciais em `.env`.

## Testes
Com o servidor e o banco de demonstração ligados:
```
set ADMIN_PASS=<senha gerada no seed:demo>
npm run test:api
npm run test:ui
npm run test:signup
npm run test:ui-signup
```
`test:signup` usa `BASE2` (opcional) para testar o limite de tentativas: suba um segundo servidor com `SIGNUP_RATE_LIMIT=3` e `PORT=3998`.
(use um banco de teste: os testes criam pedidos, usuários e alteram configurações da loja demo.)

## Antes de publicar na internet
- Sessões ficam em memória (reiniciar o servidor desloga todos): trocar por store em MySQL.
- Use HTTPS (`NODE_ENV=production` ativa cookie `secure` e HSTS) e um proxy reverso.
- Faça backup do banco e da pasta `uploads/`.
