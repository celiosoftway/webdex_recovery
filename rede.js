const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();

// const sqlite3 = require("sqlite3").verbose();
// const db = new sqlite3.Database("./rede.db");

const LP_ADDRESS = process.env.LP_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS;
const SUBACCOUNTS_ADDRESS = process.env.SUBACCOUNTS_ADDRESS;

const APIKEY = process.env.APIKEY;
const RPC_1 = process.env.RPC_1;

const provider = new ethers.JsonRpcProvider(RPC_1);

// ----------------------
// getTransactions
// ----------------------

async function getTransactions(address, blocoInicial) {
    const start = blocoInicial || 0;
    let counter = 0;

    const params = new URLSearchParams({
        chainid: '137',
        module: 'account',
        action: 'tokentx',
        address: address,
        sort: 'asc',
        apikey: APIKEY
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
            data: formatTimestamp(tx.timeStamp),
            blockNumber: Number(tx.blockNumber),

            from_address: tx.from.toLowerCase() || null,
            to_address: tx.to.toLowerCase() || null,
            contractAddress: tx.contractAddress || null,
            tokenSymbol: tx.tokenSymbol || null,
            tokenDecimal: tx.tokenDecimal || null,
            valueTx: tx.value || null,
            value: Number(
                ethers.formatUnits(
                    tx.value,
                    Number(tx.tokenDecimal || 18)
                )
            ),
            function_name: tx.functionName || null
        });
    }

    // console.table(rows);
    // await saveTransactions(rows);
    console.log(`✅ ${rows.length} transações únicas carregadas`);

    return rows;
}

function formatTimestamp(timestamp) {
    // blockchain geralmente retorna em segundos
    const date = new Date(Number(timestamp) * 1000);

    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const aa = String(date.getFullYear()).slice(-2);

    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${dd}-${mm}-${aa} ${hh}:${min}:${ss}`;
}

// =====================================================
// MAIN
// =====================================================
async function salvaTxt(rows, address) {
    const fs = require('fs');

    address = address.toLowerCase();

    // transações relacionadas
    const output = rows
        .filter(r =>
            r.from_address?.toLowerCase() === address ||
            r.to_address?.toLowerCase() === address
        )
        .map(r => ({
            data: r.data,
            from: r.from_address?.toLowerCase(),
            to: r.to_address?.toLowerCase(),
            value: r.value,
        }));

    console.table(output);

    // =========================
    // DISTINCT FROM
    // carteiras que ENVIARAM para o address
    // =========================
    const distinctFrom = [
        ...new Set(
            output
                .filter(r => r.to === address)
                .map(r => r.from)
                .filter(Boolean)
        )
    ];

    // =========================
    // DISTINCT TO
    // carteiras que RECEBERAM do address
    // =========================
    const distinctTo = [
        ...new Set(
            output
                .filter(r => r.from === address)
                .map(r => r.to)
                .filter(Boolean)
        )
    ];

    // salva transações completas
    fs.writeFileSync(
        './resultado.json',
        JSON.stringify(output, null, 2),
        'utf-8'
    );

    // salva distincts
    fs.writeFileSync(
        './distinct_from.txt',
        distinctFrom.join('\n'),
        'utf-8'
    );

    fs.writeFileSync(
        './distinct_to.txt',
        distinctTo.join('\n'),
        'utf-8'
    );

    console.log('✅ Arquivos salvos');
    console.log(`📥 Recebeu de ${distinctFrom.length} carteiras únicas`);
    console.log(`📤 Enviou para ${distinctTo.length} carteiras únicas`);
}

async function main() {
    const address =
        '0x68c1d8454f3c8bc9a9EB7D4910Aaa67bd687890D'.toLowerCase();

    const response = await getTransactions(address, 83891753);

    console.log(`Total bruto: ${response.total}`);
    console.log(`Último bloco: ${response.ultimoBloco}`);

    const rows = await processTransactions(response);

    await salvaTxt(rows, address);
}

main().catch(console.error);