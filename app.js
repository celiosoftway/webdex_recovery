const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

const LPUSDT_ADDRESS = process.env.LPUSDT_ADDRESS;
const APIKEY = process.env.APIKEY;
const RPC_1 = process.env.RPC_1;
const RPC_2 = process.env.RPC_2;

const provider = new ethers.JsonRpcProvider(RPC_1);

const {
    db,
    insertTransactions,
    updateTransactionStatusByHash,
    upsertOpenPositionEvents
} = require('./db');


async function getTxData(txHash) {
    const receipt = await provider.getTransactionReceipt(txHash);

    return {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs
    };
}

// ----------------------
// getTransactions
// ----------------------

async function getTransactions(blocoInicial, blocoFinal, apikey) {
    try {
        const params = new URLSearchParams({
            chainid: '137',
            module: 'account',
            action: 'tokentx',
            contractaddress: LPUSDT_ADDRESS,
            sort: 'asc',
            apikey: apikey || APIKEY,
            startblock: blocoInicial || 85667046,
            endblock: blocoFinal || 85669498,
        });

        const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
        const response = await axios.get(url);
        const data = response.data;

        console.log(url);

        if (!data.result || !Array.isArray(data.result)) {
            throw new Error("Erro ao obter transações.");
        }

        if (data.result.length === 0) {
            return {
                transactions: [],
                ultimoBloco: blocoInicial
            };
        }

        const lastTx = data.result[data.result.length - 1];
        const ultimoBloco = Number(lastTx.blockNumber);
        const ultimoTimestamp = Number(lastTx.timeStamp);

        return {
            transactions: data.result,
            ultimoBloco,
            ultimoTimestamp
        };

    } catch (error) {
        console.error("Erro em getTransactionsAPI:", error);
        return {
            transactions: [],
            ultimoBloco: blocoInicial,
            ultimoTimestamp: 0
        };
    }
}

// ----------------------
// ABI EVENTS
// ----------------------
const iface = new ethers.Interface([
    "event BalanceLiquidity(address indexed manager, address indexed user, string accountId, address strategy, address coin, uint256 balance, uint256 value, bool increase, bool is_operation)",
    "event OpenPosition(address indexed manager, address user, string accountId, tuple(address strategy,address coin,string botId,uint256 oldBalance,uint256 fee,uint256 gas,int256 profit) details)"
]);

function toStringSafe(v) {
    if (typeof v === "bigint") return v.toString();
    return String(v);
}

// ----------------------
// DECODER
// ----------------------
function parseIncidentTx(tx) {
    const result = {
        txHash: tx.hash,
        blockNumber: parseInt(tx.blockNumber),
        logs: []
    };

    for (const log of tx.logs) {
        try {
            const parsed = iface.parseLog({
                topics: log.topics,
                data: log.data
            });

            if (parsed.name === "BalanceLiquidityyyyy") {
                const a = parsed.args;

                result.logs.push({
                    event: "BalanceLiquidity",
                    user: a.user,
                    accountId: a.accountId,
                    coin: a.coin,
                    value: toStringSafe(a.value),
                    balance: toStringSafe(a.balance),
                    increase: a.increase
                });
            }

            if (parsed.name === "OpenPosition") {
                const a = parsed.args;
                const d = a.details;

                result.logs.push({
                    event: "OpenPosition",
                    user: a.user,
                    accountId: a.accountId,
                    coin: d.coin,
                    oldBalance: toStringSafe(d.oldBalance),
                    profit: toStringSafe(d.profit),
                    fee: toStringSafe(d.fee)
                });
            }

        } catch (e) { }
    }

    return result;
}

// ----------------------
// FETCH + PARSE
// ----------------------
async function getIncidentTx(txHash) {
    const apiKey = "SUA_API_KEY";
    const chainid = 56; // BSC, mude se precisar

    const url =
        `https://api.etherscan.io/v2/api` +
        `?chainid=${chainid}` +
        `&module=proxy` +
        `&action=eth_getTransactionReceipt` +
        `&txhash=${txHash}` +
        `&apikey=${apiKey}`;

    const { data } = await axios.get(url);

    if (!data.result) {
        throw new Error("TX não encontrada");
    }

    const receipt = data.result;

    return parseIncidentTx({
        hash: txHash,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs
    });
}

function normalizeTransactions(response) {
    const transactions = Array.isArray(response.transactions)
        ? response.transactions
        : [];

    return transactions.map(tx => ({
        blockNumber: Number(tx.blockNumber),
        timeStamp: Number(tx.timeStamp),
        hash: tx.hash,
        methodId: tx.methodId || null,
        transactionIndex: Number(tx.transactionIndex)
    }));
}

async function processTransactions(response) {
    const transactions = response.transactions || [];
    const seen = new Set();
    const rows = [];

    for (const tx of transactions) {
        const hash = tx.hash;

        if (seen.has(hash)) continue;
        seen.add(hash);

        rows.push({
            blockNumber: Number(tx.blockNumber),
            timeStamp: Number(tx.timeStamp),
            hash,
            methodId: tx.methodId || null,
            transactionIndex: Number(tx.transactionIndex)
        });
    }

    console.table(rows);

    await insertTransactions(rows);

    console.log(`✅ ${rows.length} transações únicas carregadas`);
}

async function processTransactionEvents(txHash) {
    try {
        // marca como processando (opcional)
        await updateTransactionStatusByHash(txHash, "running", 0);

        // 1. busca receipt na blockchain
        const receipt = await provider.getTransactionReceipt(txHash);

        const tx = {
            hash: receipt.hash,
            blockNumber: receipt.blockNumber,
            logs: receipt.logs
        };

        const events = [];

        // 2. percorre todos os logs da tx
        for (const log of tx.logs) {
            try {
                const parsed = iface.parseLog({
                    topics: log.topics,
                    data: log.data
                });

                // 3. filtra somente OpenPosition
                if (parsed.name === "OpenPosition") {
                    const a = parsed.args;
                    const d = a.details;

                    events.push({
                        txHash: tx.hash,
                        logIndex: Number(log.index ?? log.logIndex ?? 0),

                        user: a.user,
                        accountId: a.accountId,
                        coin: d.coin,

                        oldBalance: toStringSafe(d.oldBalance),
                        profit: toStringSafe(d.profit),
                        fee: toStringSafe(d.fee)
                    });
                }

            } catch (e) {
                // log não pertence ao ABI monitorado
            }
        }

        // 4. salva no banco
        if (events.length > 0) {
            await upsertOpenPositionEvents(events);
        }

        // 5. marca sucesso
        await updateTransactionStatusByHash(txHash, "success", 1);

        console.log(`✅ ${txHash} -> ${events.length} eventos`);

    } catch (err) {
        await updateTransactionStatusByHash(txHash, "error", 0);
        console.error(`❌ ${txHash}`, err.message);
    }
}

module.exports = {
    getIncidentTx,
    parseIncidentTx,

    getTxData,
    getTransactions,

    processTransactions,
    processTransactionEvents
};

/*
(async () => {
   
  const txHash = "0x3584ece414800eac65374c882289ab908275f804059f826829bb8d6be3d15ea3";
  const tx = await getTxData(txHash);
  const data = parseIncidentTx(tx);
  console.log(JSON.stringify(data, null, 2));
  

    const transactions = await getTransactions();
    //const rows = normalizeTransactions(transactions);
    // console.log(rows);
    processTransactions(transactions);
    //console.log(transactions)
})();
*/