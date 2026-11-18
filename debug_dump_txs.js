import 'dotenv/config';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

const TARGET_USER_ADDRESS = process.env.TEST_USER_ADDRESS || 'TB3U4UP44CFQO4FNN4XSFQRJLZW22DVXANEYJOI';
const BOT_PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY || '49479501DC856E3A118116289F4FD8752BF4D1234E8B0E8CCAE991936B72544F';
const NODE_URL = (process.env.SYMBOL_NODE || 'https://sym-test-01.rio-symbol.com:3001').replace(/\/$/, '');

function getBotPublicKeyHex(privateKeyStr) {
  try {
    const keyPair = new KeyPair(new PrivateKey(privateKeyStr.trim()));
    const pk = keyPair.publicKey;
    if (pk.bytes) return Buffer.from(pk.bytes).toString('hex').toUpperCase();
    return String(pk).replace(/^0x/i, '').toUpperCase();
  } catch { return ''; }
}

function decodeHexMessage(hex) {
  if (!hex || typeof hex !== 'string') return '(メッセージなし)';
  const clean = hex.startsWith('00') ? hex.substring(2) : hex;
  try {
    const text = Buffer.from(clean, 'hex').toString('utf-8');
    return text || `(Hex: ${clean})`;
  } catch {
    return `(Hex: ${clean})`;
  }
}

async function debugDumpAllTransferTxs() {
  const cleanUserAddrB32 = TARGET_USER_ADDRESS.replace(/-/g, '').trim().toUpperCase();
  const botPublicKeyHex = getBotPublicKeyHex(BOT_PRIVATE_KEY);

  console.log(`📡 オンチェーン・トランザクション生データ診断を開始します...`);
  console.log(`   - 対象ユーザー: ${cleanUserAddrB32}`);
  console.log(`   - Bot 公開鍵  : ${botPublicKeyHex}\n`);

  const groups = ['confirmed', 'unconfirmed', 'partial'];
  let foundCount = 0;

  for (const group of groups) {
    const url = `${NODE_URL}/transactions/${group}?signerPublicKey=${botPublicKeyHex}&order=desc&pageSize=100`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      const items = data.data || [];

      for (const item of items) {
        const mainTx = item.transaction || item;
        
        // アグリゲートTxおよび単体TransferTxを抽出
        const candidateTxs = [mainTx];
        if (mainTx.transactions && Array.isArray(mainTx.transactions)) {
          for (const inner of mainTx.transactions) {
            candidateTxs.push(inner.transaction || inner);
          }
        }

        for (const tx of candidateTxs) {
          // Transfer Transaction (Type: 16724) のみ抽出
          if (tx.type === 16724) {
            foundCount++;
            const recipient = tx.recipientAddress || '(不明)';
            const rawMsg = tx.message ? (tx.message.payload || tx.message) : null;
            const decodedMsg = decodeHexMessage(rawMsg);
            const mosaics = tx.mosaics || [];

            console.log(`--------------------------------------------------`);
            console.log(` [#${foundCount}] [プール: ${group}] Tx Type: Transfer (16724)`);
            console.log(`   宛先 (Recipient) : ${JSON.stringify(recipient)}`);
            console.log(`   解読メッセージ    : "${decodedMsg}"`);
            console.log(`   生のメッセージHex : "${rawMsg || 'なし'}"`);
            console.log(`   送信モザイク      : ${JSON.stringify(mosaics)}`);
          }
        }
      }
    } catch (e) {
      console.warn(`⚠️ 通信エラー:`, e.message);
    }
  }

  if (foundCount === 0) {
    console.log(`❌ Transfer Transaction（送金・モザイク送信）が1件も存在しませんでした。`);
  }
}

debugDumpAllTransferTxs();