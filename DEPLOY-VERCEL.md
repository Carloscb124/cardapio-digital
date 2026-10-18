# Publicar na Vercel (para testar com um amigo)

A Vercel hospeda o site, mas **não tem banco MySQL** e não guarda arquivos nem sessões entre requisições.
Por isso este projeto já guarda **sessões e imagens no banco**, e você precisa de um MySQL na nuvem.
Os nomes de botões dos sites podem mudar um pouco; siga a ideia de cada passo.

## 1) Banco MySQL gratuito (Aiven)
1. Crie conta em aiven.io (não pede cartão no plano gratuito) e crie um serviço **MySQL** no plano **Free**.
2. Espere ficar "Running". Na página do serviço, anote: **Host, Port, User, Password, Database** e baixe o **CA certificate** (`ca.pem`).
3. O plano gratuito pode ser desligado por falta de uso; se acontecer, ligue de novo no painel da Aiven.

## 2) Teste o banco na sua máquina
1. Salve o `ca.pem` dentro da pasta do projeto.
2. Copie `.env.example` para `.env` e preencha:
   ```
   SESSION_SECRET=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
   DB_HOST=<host da Aiven>
   DB_PORT=<porta da Aiven>
   DB_USER=<usuário>
   DB_PASSWORD=<senha>
   DB_NAME=<nome do banco, ex.: defaultdb>
   DB_SSL=true
   DB_SSL_CA_FILE=ca.pem
   ```
3. No terminal: `npm install`, depois `npm run db:init` (cria as tabelas na nuvem) e `npm start`.
4. Abra http://localhost:3000/cadastro e crie uma conta. Se funcionou, o banco na nuvem está certo.

## 3) Coloque o código no GitHub
1. Instale o Git e crie um repositório **privado** no github.com.
2. Na pasta do projeto:
   ```
   git init
   git add .
   git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/cardapio-digital.git
   git push -u origin main
   ```
3. Confira no GitHub que **não** subiu o arquivo `.env` (o `.gitignore` já o exclui).

## 4) Crie o projeto na Vercel
1. Entre em vercel.com com sua conta do GitHub → **Add New → Project** → importe o repositório.
2. Em **Framework Preset**, deixe "Express" (se não aparecer, use "Other"). Não precisa de Build Command.
3. Abra **Environment Variables** e adicione:

   | Nome | Valor |
   |---|---|
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | um texto aleatório longo (pode ser o mesmo do seu `.env`) |
   | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | os dados da Aiven |
   | `DB_SSL` | `true` |
   | `DB_SSL_CA` | **todo o conteúdo** do `ca.pem` (cole inclusive as linhas BEGIN/END CERTIFICATE) |
   | `DB_POOL` | `3` |

4. Clique em **Deploy**. Ao terminar, abra o endereço `https://SEU-PROJETO.vercel.app`.
5. (Opcional) Em **Settings → Functions**, escolha a região da função mais próxima do seu banco.

> Variáveis de ambiente só valem para novos deploys: se mudar alguma depois, faça **Redeploy**.

## 5) Teste e compartilhe
1. Abra `/cadastro` no site publicado, crie a conta da loja, cadastre uma categoria e um produto.
2. Abra `/m/<endereço-da-loja>`, faça um pedido, acompanhe em `/pedido/...` e confirme em **Pedidos** no painel.
3. Mande o link do cardápio (`https://SEU-PROJETO.vercel.app/m/SUA-LOJA`) para o seu amigo.
4. Se não quiser que estranhos criem contas, adicione `SIGNUP_ENABLED=false` e faça Redeploy (depois de criar as contas necessárias).

## 6) Atualizar depois
`git add .` → `git commit -m "descrição"` → `git push`. A Vercel publica sozinha, e as migrações do banco rodam na primeira requisição.

## Se algo der errado
Abra o projeto na Vercel → **Deployments** → o último deploy → **Logs** (ou Runtime Logs) e procure o erro.

| Sintoma / erro no log | Causa provável |
|---|---|
| `Defina SESSION_SECRET` | variável `SESSION_SECRET` ausente (ou menos de 16 caracteres); adicione e faça Redeploy |
| `ETIMEDOUT` / `ECONNREFUSED` | host/porta errados ou serviço da Aiven desligado |
| `self-signed certificate in chain` | `DB_SSL_CA` ausente ou incompleto |
| `Access denied` | usuário/senha errados |
| `Too many connections` | reduza `DB_POOL` para `2` |
| Páginas abrem mas `/api/...` dá 404 | framework não detectado como Express; confira o Framework Preset e o `vercel.json` na raiz |
| `/m/loja` dá 404 | `vercel.json` não foi enviado ao GitHub |

## Limites e cuidados
- O plano gratuito da Vercel (Hobby) é para uso pessoal/não comercial; para uso comercial confira os termos e planos.
- Primeiro acesso depois de um tempo parado pode demorar alguns segundos (instância "fria").
- As imagens ficam no banco (limite do plano gratuito da Aiven: cerca de 1 GB) e têm no máximo 2 MB cada.
- É um ambiente de teste. Antes de atender clientes reais, revise backups, termos de uso/privacidade e e-mail de recuperação de senha.
