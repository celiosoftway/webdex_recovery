// db.js
// npm install sqlite3
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./recovery.db", (err) => {
    if (err) {
        console.error("❌ Erro ao abrir DB:", err.message);
    } else {
        console.log("✅ DB aberto");
    }
});

// -----------------------------------
// TEST CONNECTION
// -----------------------------------

async function testConnection() {
    return new Promise((resolve, reject) => {
        db.get("SELECT 1 AS ok", (err, row) => {
            if (err) {
                console.error("❌ DB error:", err.message);
                return reject(err);
            }

            console.log("✅ DB connected", row);
            resolve(true);
        });
    });
}

// --------------------------------------------------
// INIT
// --------------------------------------------------
function initDatabase() {
    db.serialize(() => {
        db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blockNumber INTEGER NOT NULL,
        timeStamp INTEGER NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        methodId TEXT,
        transactionIndex INTEGER,

        processed INTEGER DEFAULT 0, -- boolean: 0=false / 1=true
        status TEXT DEFAULT 'pending'
          CHECK(status IN ('pending','running','success','error'))
      )
    `);

        db.run(`
      CREATE INDEX IF NOT EXISTS idx_transactions_block
      ON transactions(blockNumber)
    `);

        db.run(`
      CREATE INDEX IF NOT EXISTS idx_transactions_status
      ON transactions(status)
    `);
    });
}

// --------------------------------------------------
// INSERT UNIQUE TXS
// Ignora hash repetida
// --------------------------------------------------
async function insertTransactions(transactions) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
      INSERT INTO transactions
      (blockNumber, timeStamp, hash, methodId, transactionIndex)
      VALUES (?, ?, ?, ?, ?)

      ON CONFLICT(hash) DO UPDATE SET
        blockNumber = excluded.blockNumber,
        timeStamp = excluded.timeStamp,
        methodId = excluded.methodId,
        transactionIndex = excluded.transactionIndex
    `);

        db.serialize(() => {
            for (const tx of transactions) {
                stmt.run(
                    Number(tx.blockNumber),
                    Number(tx.timeStamp),
                    tx.hash,
                    tx.methodId || null,
                    Number(tx.transactionIndex)
                );
            }

            stmt.finalize(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

// --------------------------------------------------
// GET PENDING
// --------------------------------------------------
function getPendingTransactions(limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(
            `
      SELECT *
      FROM transactions
      WHERE processed = 0
        AND status = 'pending'
      ORDER BY blockNumber ASC, transactionIndex ASC
      LIMIT ?
      `,
            [limit],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            }
        );
    });
}

// --------------------------------------------------
// UPDATE STATUS
// --------------------------------------------------
function updateTransactionStatus(id, status, processed = 0) {
    return new Promise((resolve, reject) => {
        db.run(
            `
      UPDATE transactions
      SET status = ?, processed = ?
      WHERE id = ?
      `,
            [status, processed, id],
            function (err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

// --------------------------------------------------
// MARK SUCCESS
// --------------------------------------------------
function markSuccess(id) {
    return updateTransactionStatus(id, "success", 1);
}

// --------------------------------------------------
// CLOSE
// --------------------------------------------------
function closeDatabase() {
    db.close();
}

// -----------------------------------
// RAW QUERY GENÉRICA
// -----------------------------------
async function runQuery(sql, replacements = {}, type = QueryTypes.SELECT) {
    try {
        const results = await sequelize.query(sql, {
            replacements,
            type
        });

        return results;
    } catch (err) {
        console.error("❌ Query error:", err.message);
        throw err;
    }
}



// --------------------------------------------------
// EVENTS TABLE (OpenPosition)
// --------------------------------------------------
function initEventsTable() {
    db.run(`
    CREATE TABLE IF NOT EXISTS events_open_position (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      txHash TEXT NOT NULL,
      logIndex INTEGER DEFAULT 0,

      user TEXT NOT NULL,
      accountId TEXT NOT NULL,
      coin TEXT NOT NULL,

      oldBalance TEXT DEFAULT '0',
      profit TEXT DEFAULT '0',
      fee TEXT DEFAULT '0',

      createdAt INTEGER DEFAULT (strftime('%s','now')),

      UNIQUE(txHash, logIndex)
    )
  `);

    db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_txhash
    ON events_open_position(txHash)
  `);

    db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_user
    ON events_open_position(user)
  `);
}

// --------------------------------------------------
// UPSERT EVENTS
// events = [
//   {
//     txHash,
//     logIndex,
//     user,
//     accountId,
//     coin,
//     oldBalance,
//     profit,
//     fee
//   }
// ]
// --------------------------------------------------
function upsertOpenPositionEvents(events) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
      INSERT INTO events_open_position
      (
        txHash,
        logIndex,
        user,
        accountId,
        coin,
        oldBalance,
        profit,
        fee
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(txHash, logIndex) DO UPDATE SET
        user = excluded.user,
        accountId = excluded.accountId,
        coin = excluded.coin,
        oldBalance = excluded.oldBalance,
        profit = excluded.profit,
        fee = excluded.fee
    `);

        db.serialize(() => {
            for (const ev of events) {
                stmt.run(
                    ev.txHash,
                    Number(ev.logIndex || 0),
                    ev.user.toLowerCase(),
                    ev.accountId,
                    ev.coin.toLowerCase(),
                    String(ev.oldBalance || "0"),
                    String(ev.profit || "0"),
                    String(ev.fee || "0")
                );
            }

            stmt.finalize(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

function updateTransactionStatusByHash(hash, status, processed = 0) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      UPDATE transactions
      SET status = ?, processed = ?
      WHERE hash = ?
      `,
      [status, processed, hash],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

module.exports = {
    db,
    initDatabase,
    insertTransactions,
    getPendingTransactions,
    updateTransactionStatus,
    markSuccess,
    closeDatabase,
    runQuery,
    testConnection,

    initEventsTable,
    upsertOpenPositionEvents,
    updateTransactionStatusByHash
};