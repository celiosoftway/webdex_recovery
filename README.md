# WebDex Recovery

Script em Node.js para **análise forense e recovery de incidentes on-chain**.
O projeto indexa transações de um contrato LP, identifica transações suspeitas, extrai eventos relevantes e reconstrói snapshots de saldo por carteira antes e depois de um ataque.

## Ideal para

* incident response
* exploit analysis
* cálculo de perdas por usuário
* auditoria de carteiras afetadas
* geração de base de dados para compensação

---

# Como funciona

O fluxo principal executa:

1. Cria as tabelas SQLite
2. Busca transações do contrato LP via Etherscan V2
3. Salva transações únicas
4. Remove transações legítimas (mantém suspeitas)
5. Processa receipts e extrai eventos `OpenPosition`
6. Identifica usuários afetados
7. Consulta saldo histórico do LP token
8. Salva snapshots before / after / loss

---

# Stack

* Node.js
* SQLite
* ethers.js
* axios
* dotenv

---

# Instalação

```bash
npm install
npm install ethers axios sqlite3 dotenv
```

---

# Configuração

Renomeie `.env.example` para `.env`

```env
LP_ADDRESS=0xSeuContratoAqui
LPUSDT_ADDRESS=0xFb2e2Ff7B51C2BcAf58619a55e7d2Ff88cFD8aCA
LPLOOP_ADDRESS=0xB56032D0B576472b3f0f1e4747f488769dE2b00B
APIKEY=sua_api_key
RPC_1=https://seu-rpc
```

---

# Execução

```bash
node run.js
```

---

# Banco de Dados

O script cria automaticamente `recovery.db`.

## transactions

Armazena transações do contrato.

Campos principais:

* blockNumber
* hash
* methodId
* functionName
* status
* processed

## events_open_position

Eventos extraídos das transações suspeitas.

Campos:

* txHash
* user
* accountId
* coin
* oldBalance
* profit
* fee

## user_snapshots

Saldo histórico por carteira.

Campos:

* beforeBlock
* afterBlock
* user
* balanceBefore
* balanceAfter
* loss

---

# Fluxo de Recovery

## 1. Coleta de transações

Consulta intervalo de blocos configurado no código.

Exemplo atual:

* beforeBlock: `85662605`
* afterBlock: `85677112`

## 2. Filtro de ataque

No caso atual, transações maliciosas possuem:

```sql
functionName IS NULL
```

## 3. Processamento de eventos

Para cada tx suspeita:

* busca receipt
* decodifica logs
* extrai `OpenPosition`

## 4. Snapshot de saldos

Para cada usuário afetado:

```js
balanceOf(user, { blockTag })
```

Compara:

* saldo antes do ataque
* saldo depois do ataque
* prejuízo estimado

---

# Exemplo de saída

```text
1/245 0xabc...123 510.240640 0.000000 510.240640
2/245 0xdef...456 1200.000000 300.000000 900.000000
```

---

# Estrutura do Projeto

```text
.
├── app.js
├── db.js
├── run.js
├── .env.example
├── recovery.db
└── README.md
```

---

# Licença

MIT

---

# Disclaimer

Ferramenta educacional e investigativa.
Use por sua conta e risco. Sempre valide resultados antes de qualquer compensação financeira.
