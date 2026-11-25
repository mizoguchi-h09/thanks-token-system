import 'dotenv/config';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const USER_ADDRESS = process.env.TEST_USER_ADDRESS || 'TANL2CC5VR2GDLYAHANL4GKTBDRIKUIXPNU67TA';
const NODE_URL = (process.env.SYMBOL_NODE || 'https://401-sai-dual.symboltest.net:3001').replace(/\/$/, '');

function decodeMessage(msgObj) {
  if (!msgObj) return '(なし)';
  const hex = typeof msgObj === 'string' ? msgObj : (msgObj.payload || msgObj.hex || '');
  if (!hex) return '(なし)';
  const clean = hex.startsWith('00') ? hex.substring(2) : hex;
  try {
    return Buffer.from(clean, 'hex').toString('utf-8') || `(Hex: ${clean})`;
  } catch {
    return `(Hex: ${clean})`;
  }
}

async function dumpUserTransactions() {
  const cleanAddr = USER_ADDRESS.replace(/-/g, '').trim().toUpperCase();
  console.log(`📦 ユーザー [${cleanAddr}] の全18件のトランザクション詳細を全抽出します...\n`);

  const url = `${NODE_URL}/transactions/confirmed?address=${cleanAddr}&order=desc&pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('通信エラー:', res.status);
    return;
  }

  const data = await res.json();
  const items = data.data || [];

  items.forEach((item, index) => {
    const tx = item.transaction || item;
    console.log(`--------------------------------------------------`);
    console.log(`[#${index + 1}] Type: ${tx.type} | Hash: ${item.meta?.hash?.substring(0, 16)}...`);
    console.log(`   Signer (送信者)   : ${tx.signerPublicKey}`);
    console.log(`   Message (解読)    : "${decodeMessage(tx.message)}"`);

    // アグリゲートインナーTxを展開
    if (tx.transactions && Array.isArray(tx.transactions)) {
      console.log(`   📦 アグリゲート内部 (インナーTx ${tx.transactions.length} 件):`);
      tx.transactions.forEach((innerWrapper, i) => {
        const inner = innerWrapper.transaction || innerWrapper;
        console.log(`      [インナー #${i + 1}] Type: ${inner.type}`);
        console.log(`         Recipient (宛先): ${inner.recipientAddress || '(なし)'}`);
        console.log(`         Message (解読)  : "${decodeMessage(inner.message)}"`);
        console.log(`         Mosaics (モザイク): ${JSON.stringify(inner.mosaics || [])}`);
      });
    }
  });
}

dumpUserTransactions();