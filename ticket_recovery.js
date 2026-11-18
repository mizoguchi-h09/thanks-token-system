import 'dotenv/config';
import { PrivateKey } from 'symbol-sdk';
import { KeyPair, Address } from 'symbol-sdk/symbol';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const TARGET_USER_ADDRESS = process.env.TEST_USER_ADDRESS || 'TB3U4UP44CFQO4FNN4XSFQRJLZW22DVXANEYJOI';
const BOT_PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY || '49479501DC856E3A118116289F4FD8752BF4D1234E8B0E8CCAE991936B72544F';
const BOT_ADDRESS = process.env.SYMBOL_ADDRESS || 'TAJVK3M5ADUW3V3WC3UIWDDB73LSE533HJIJ7UQ';
const NODE_URL = (process.env.SYMBOL_NODE || 'https://401-sai-dual.symboltest.net:3001').replace(/\/$/, '');

function getBotPublicKeyHex(privateKeyStr) {
  if (!privateKeyStr) return '';
  try {
    const keyPair = new KeyPair(new PrivateKey(privateKeyStr.trim()));
    const pk = keyPair.publicKey;
    if (pk.bytes) return Buffer.from(pk.bytes).toString('hex').toUpperCase();
    return String(pk).replace(/^0x/i, '').toUpperCase();
  } catch {
    return '';
  }
}

function addressToHex(b32Addr) {
  try {
    const addrObj = new Address(b32Addr);
    if (addrObj.bytes) return Buffer.from(addrObj.bytes).toString('hex').toUpperCase();
  } catch {}
  return '';
}

/**
 * トランザクション詳細をハッシュ値から個別取得して完全展開
 */
async function fetchFullTransactionDetail(group, hash) {
  const url = `${NODE_URL}/transactions/${group}/${hash}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 文字列・Hex・配列から刻印ログを抽出する関数
 */
function tryExtractTicketLog(val) {
  if (!val) return null;

  if (typeof val === 'string') {
    const clean = val.replace(/^0x/i, '').trim();
    if (clean.includes('TICKET_ISSUE:') || clean.includes('TICKET_USE:')) {
      return clean;
    }

    const candidates = clean.startsWith('00') ? [clean.substring(2), clean] : [clean];
    for (const cand of candidates) {
      if (/^[0-9a-fA-F]+$/.test(cand) && cand.length >= 8) {
        try {
          const decoded = Buffer.from(cand, 'hex').toString('utf-8');
          if (decoded.includes('TICKET_ISSUE:') || decoded.includes('TICKET_USE:')) {
            return decoded;
          }
        } catch {}
      }
    }
  } else if (Array.isArray(val) && val.length > 5 && val.every(x => typeof x === 'number')) {
    try {
      const decoded = Buffer.from(val.filter(x => x !== 0)).toString('utf-8');
      if (decoded.includes('TICKET_ISSUE:') || decoded.includes('TICKET_USE:')) {
        return decoded;
      }
    } catch {}
  }

  return null;
}

/**
 * JSON構造全体を深層スキャン
 */
function deepScanForTickets(node, resultStore) {
  if (!node) return;

  const log = tryExtractTicketLog(node);
  if (log) {
    if (log.includes('TICKET_ISSUE:')) {
      const ticketId = log.split('TICKET_ISSUE:')[1].trim();
      if (ticketId) resultStore.issuedSet.add(ticketId);
    } else if (log.includes('TICKET_USE:')) {
      const ticketId = log.split('TICKET_USE:')[1].trim();
      if (ticketId) resultStore.usedSet.add(ticketId);
    }
  }

  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      deepScanForTickets(node[key], resultStore);
    }
  }
}

async function verifyTicketStatus() {
  const cleanUserAddrB32 = TARGET_USER_ADDRESS.replace(/-/g, '').trim().toUpperCase();
  const cleanUserAddrHex = addressToHex(cleanUserAddrB32);
  const botPublicKeyHex = getBotPublicKeyHex(BOT_PRIVATE_KEY);

  console.log(`🔎 照合設定:`);
  console.log(`   - 接続ノード      : ${NODE_URL}`);
  console.log(`   - ユーザーアドレス : ${cleanUserAddrB32}`);
  console.log(`   - Bot 公開鍵       : ${botPublicKeyHex}\n`);

  const resultStore = {
    issuedSet: new Set(),
    usedSet: new Set()
  };

  const groups = ['confirmed', 'unconfirmed', 'partial'];
  const processedHashes = new Set();

  for (const group of groups) {
    const endpoints = [
      `address=${cleanUserAddrB32}`,
      `signerPublicKey=${botPublicKeyHex}`
    ];
    if (cleanUserAddrHex) endpoints.push(`recipientAddress=${cleanUserAddrHex}`);

    for (const param of endpoints) {
      let pageNumber = 1;
      let hasNextPage = true;

      while (hasNextPage && pageNumber <= 5) {
        const url = `${NODE_URL}/transactions/${group}?${param}&order=desc&pageSize=100&pageNumber=${pageNumber}`;
        try {
          const res = await fetch(url);
          if (!res.ok) break;

          const data = await res.json();
          const items = data.data || [];
          if (items.length === 0) break;

          for (const item of items) {
            const hash = item.meta?.hash;
            if (hash && processedHashes.has(hash)) continue;
            if (hash) processedHashes.add(hash);

            const txType = item.transaction?.type;

            // アグリゲートTx (16705 / 16961) の場合はハッシュ個別取得でインナーTxを完全取得
            if (txType === 16705 || txType === 16961) {
              const fullDetail = await fetchFullTransactionDetail(group, hash);
              if (fullDetail) {
                deepScanForTickets(fullDetail, resultStore);
              } else {
                deepScanForTickets(item, resultStore);
              }
            } else {
              deepScanForTickets(item, resultStore);
            }
          }

          if (items.length < 100) hasNextPage = false;
          else pageNumber++;
        } catch {
          hasNextPage = false;
        }
      }
    }
  }

  // 判定処理:
  // 1. TICKET_ISSUE のみ存在 ➔ 未使用 (Unused)
  // 2. TICKET_ISSUE と TICKET_USE の両方が存在 ➔ 使用済み (Used)
  const issuedList = [...resultStore.issuedSet];
  const usedList = issuedList.filter(id => resultStore.usedSet.has(id));
  const unusedList = issuedList.filter(id => !resultStore.usedSet.has(id));

  console.log('================ オンチェーンチケット検証結果 ================');
  console.log('📦 発行済みチケット (購入記録あり):', issuedList);
  console.log('🔴 使用済みチケット (購入 & 使用記録あり):', usedList);
  console.log('----------------------------------------------------');
  console.log('🟢 未使用チケット (購入記録のみ):', unusedList);
  console.log('====================================================\n');
}

verifyTicketStatus();