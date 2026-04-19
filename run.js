
const {
    db,
    initDatabase,
    initEventsTable,
    testConnection,
    getPendingTransactions
} = require('./db');

const {
    getTransactions,
    processTransactions,
    parseIncidentTx,
    getTxData,
    processTransactionEvents
} = require('./app');

async function logEventos() {
    try {
        await testConnection();

        // busca hashes pendentes
        const transactions = await getPendingTransactions(1000);
        console.log(`📦 Pendentes: ${transactions.length}`);

        for (const tx of transactions) {
            console.log(`⏳ Processando: ${tx.hash}`);
            await processTransactionEvents(tx.hash);
        }

        console.log("✅ Fim do processamento");

    } catch (error) {
        console.error(error);
    } finally {
        db.close();
    }
}


(async () => {
    try {
        await logEventos();
        
        // initDatabase();
        //initEventsTable();

        // const transactions = await getTransactions();
        // await processTransactions(transactions);

        // await testConnection();
        // const txHash = "0x99ff80ac3bf1d7fab8e39c46969f958e6a2062951391b6795e114a7bf1379f13";
        // await processTransactionEvents(txHash);

    } catch (error) {
        console.error(error);
    }

})()