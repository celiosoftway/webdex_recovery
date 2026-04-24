const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./usdt_fluxo.db");

const LP_ADDRESS = process.env.LP_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS;
const SUBACCOUNTS_ADDRESS = process.env.SUBACCOUNTS_ADDRESS;

const APIKEY = process.env.APIKEY;
const RPC_1 = process.env.RPC_1;

const provider = new ethers.JsonRpcProvider(RPC_1);

// ----------------------
// getTransactions
// ----------------------

async function getTransactions(blocoInicial, apikey) {
    const start = blocoInicial || 72850216; //72850216; 85794837
    let counter = 0;

    const params = new URLSearchParams({
        chainid: '137',
        module: 'account',
        action: 'tokentx',
        contractaddress: USDT_ADDRESS,
        address: SUBACCOUNTS_ADDRESS,
        sort: 'asc',
        apikey: apikey || APIKEY
    });

    try {
        async function fetchTransactions(startBlock) {
            params.set('startblock', startBlock);

            const url =
                `https://api.etherscan.io/v2/api?${params.toString()}`;

            counter++;    
            console.log(`\n[${counter}] ${url}`);

            const response = await fetch(url);
            const data = await response.json();

            if (!Array.isArray(data.result)) {
                throw new Error("Erro ao obter transações.");
            }

            return data.result;
        }

        let allTransactions = [];
        let currentBlock = start;
        let transactions = [];

        do {
            transactions = await fetchTransactions(currentBlock);

            allTransactions.push(...transactions);

            if (transactions.length > 0) {
                currentBlock =
                    Number(
                        transactions[transactions.length - 1].blockNumber
                    ) + 1;
            }

        } while (transactions.length === 10000);

        return {
            allTransactions,
            total: allTransactions.length,
            ultimoBloco: currentBlock
        };

    } catch (error) {
        console.error("Erro:", error);

        return {
            allTransactions: [],
            total: 0
        };
    }
}

async function processTransactions(response) {
    const transactions = response.allTransactions || [];
    const seen = new Set();
    const rows = [];

    for (const tx of transactions) {
        const hash = tx.hash;

        if (seen.has(hash)) continue;
        seen.add(hash);

        rows.push({
            hash,
            timeStamp: Number(tx.timeStamp),
            blockNumber: Number(tx.blockNumber),

            from_address: tx.from.toLowerCase() || null,
            to_address: tx.to.toLowerCase() || null,
            value: tx.value || null,
            function_name: tx.functionName || null
        });
    }

   // console.table(rows);
    await saveTransactions(rows);
    console.log(`✅ ${rows.length} transações únicas carregadas`);
}

// =====================================================
// CRIAR TABELA COM PROMISE
// =====================================================
function initTable() {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS transacoes (
                hash TEXT PRIMARY KEY,
                timestamp INTEGER,
                bloco INTEGER,
                from_address TEXT,
                to_address TEXT,
                value TEXT,
                function_name TEXT
            )
        `, (err) => {
            if (err) return reject(err);

            console.log("✅ Tabela pronta");
            resolve();
        });
    });
}

// =====================================================
// INSERT EM LOTE
// =====================================================
async function saveTransactions(transactions) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT INTO transacoes (
                hash,
                timestamp,
                bloco,
                from_address,
                to_address,
                value,
                function_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)

            ON CONFLICT(hash) DO UPDATE SET
                timestamp = excluded.timestamp,
                bloco = excluded.bloco,
                from_address = excluded.from_address,
                to_address = excluded.to_address,
                value = excluded.value,
                function_name = excluded.function_name
        `);

        db.serialize(() => {
            for (const tx of transactions) {
                stmt.run(
                    tx.hash,
                    Number(tx.timeStamp),
                    Number(tx.blockNumber),
                    tx.from_address,
                    tx.to_address,
                    tx.value,
                    tx.function_name || null
                );
            }

            stmt.finalize(err => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

// =====================================================
// MAIN
// =====================================================
async function main() {
    await initTable();

    const response = await getTransactions();
    console.log(`Total de transações: ${response.length}`);
    await processTransactions(response);
}

main().catch(console.error);