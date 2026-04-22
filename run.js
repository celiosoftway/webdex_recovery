
const {
    db,
    initTransactions,
    initEventsTable,
    initSnapshotsTable,
    testConnection,
    getPendingTransactions,
    upsertUserSnapshots
} = require('./db');

const {
    getTransactions,
    processTransactions,
    parseIncidentTx,
    getTxData,
    processTransactionEvents,
    getSnapshot
} = require('./app');

async function logEventos() {
    try {
        await testConnection();

        // busca hashes pendentes
        const transactions = await getPendingTransactions(1000);
        console.log(`📦 Pendentes: ${transactions.length}`);

        for (const tx of transactions) {
            console.log(`\n⏳ Processando: ${tx.hash}`);
            await processTransactionEvents(tx.hash);
        }

        console.log("✅ Fim do processamento");

    } catch (error) {
        console.error(error);
    }
}

function getUniqueUsers() {
    return new Promise((resolve, reject) => {
        db.all(`
      SELECT DISTINCT user
      FROM events_open_position
    `, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => r.user));
        });
    });
}

function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close(err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function deleteLegitTransactions() {
    return new Promise((resolve, reject) => {
        db.run(`
            DELETE FROM transactions
            WHERE functionName IS NOT NULL
        `, function (err) {
            if (err) return reject(err);

            console.log(`🗑️ Removidas ${this.changes} transações legítimas`);
            resolve(this.changes);
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function logUserSnapshots() {
    const beforeBlock = 85662605;
    const afterBlock = 85677112;

    const wallets = await getUniqueUsers();

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];

        try {
            const before = await getSnapshot(wallet, beforeBlock);
            await sleep(300);

            const after = await getSnapshot(wallet, afterBlock);
            await sleep(300);

            const loss = Number(before) - Number(after);

            await upsertUserSnapshots([
                {
                    beforeBlock,
                    afterBlock,
                    user: wallet,
                    balanceBefore: before.toString(),
                    balanceAfter: after.toString(),
                    loss: loss.toFixed(6)
                }
            ]);

            console.log(
                `${i + 1}/${wallets.length}`,
                wallet,
                before,
                after,
                loss.toFixed(6)
            );

        } catch (error) {
            console.error(`❌ Erro ${wallet}:`, error.message);
            await sleep(2000);
        }   
    }
}

async function criaTabelas() {
    try {
        await initTransactions();
        await sleep(10000);
        console.log(`✅ Banco de dados inicializado`);

        await initEventsTable();
        await sleep(10000);
        console.log(`✅ Tabela de eventos criada`);

        await initSnapshotsTable();
        await sleep(10000);
        console.log(`✅ Tabela de snapshots criada`);

        await testConnection();
        console.log(`✅ Conexão com o banco de dados testada`);
    } catch (error) {
        console.error(`❌ Erro ao criar tabelas:`, error);
    }

}

(async () => {
    try {
        // ----------------------
        // cria as tabelas
        // ----------------------

        await criaTabelas();
        console.log(`✅ Conexão com o banco de dados estabelecida`);

        // ----------------------
        // popula a tabela com os hashs de transações
        // ----------------------

        const transactions = await getTransactions();
        await processTransactions(transactions);
        await sleep(2000);

        console.log(`✅ Transações processadas: ${transactions.transactions.length}`);

        // ----------------------
        // pode ser excluido as transações que functionname for nulo, essa é a caracteristica das
        // transações do ataque. Isso evita processa transações reais do protocolo
        // ----------------------

        await deleteLegitTransactions();
        await sleep(2000);

        console.log(`✅ Transações legítimas excluídas`);

        // ----------------------
        // Processa os eventos de cada transação
        // ----------------------

        await logEventos();
        await sleep(2000);

        console.log(`✅ Eventos processados`);

        // ----------------------
        // Popula snapshot com saldo das carteiras antes e depois do ataque
        // ----------------------

        await logUserSnapshots();

        console.log(`✅ Snapshots processados`);

    } catch (error) {
        console.error(error);
    } finally {
        await closeDatabase();
        console.log(`✅ Conexão com o banco de dados fechada`);
    }

})()