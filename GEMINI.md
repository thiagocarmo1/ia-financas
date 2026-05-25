# Polly e Thi finance - Guia de Migração para Nuvem

Este projeto foi preparado para ser hospedado na nuvem (ex: Render, Railway) utilizando **MongoDB Atlas**.

## Alterações Realizadas
- **Backend:** Migrado de `fs` (JSON local) para `mongoose` (MongoDB).
- **Dependências:** Adicionados `mongoose` e `dotenv`.
- **Migração:** O `server.js` possui uma função `migrateFromJson()` que importa automaticamente os dados do `data/database.json` para o MongoDB na primeira execução (se o banco estiver vazio).

## Como Configurar
1. **MongoDB Atlas:**
   - Crie uma conta gratuita no [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   - Crie um Cluster compartilhado (gratuito).
   - Em "Database Access", crie um usuário e senha.
   - Em "Network Access", libere o IP `0.0.0.0/0` (necessário para a Render).
   - Clique em "Connect" -> "Connect your application" e copie a URL de conexão.

2. **Configuração Local:**
   - Crie um arquivo `.env` na raiz do projeto (use o `.env.example` como base).
   - Cole sua URL do MongoDB no campo `MONGODB_URI`.
   - Execute `npm install` (se possível) para instalar as novas dependências.

3. **Deploy (Render):**
   - Suba o código para um repositório no **GitHub**.
   - No painel da **Render**, crie um novo "Web Service".
   - Conecte seu repositório.
   - Configure a "Start Command" como `npm start`.
   - Em "Environment Variables", adicione a `MONGODB_URI` com a sua URL do Atlas.

## Estrutura de Dados
- **Users:** Cada usuário possui perfil, metas, reserva e um mapa de meses (`YYYY-MM`).
- **Months:** Cada mês contém um array de transações e o saldo de fechamento.
