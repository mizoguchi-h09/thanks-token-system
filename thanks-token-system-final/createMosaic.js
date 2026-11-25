//回収可能モザイク作成用
import 'dotenv/config';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, generateMosaicId } from 'symbol-sdk/symbol';

// ===== 設定領域 =====
const PRIVATE_KEY = (process.env.SYMBOL_PRIVATE_KEY).trim();
const NODE_URL = process.env.SYMBOL_NODE;
// ====================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createRevokableMosaic() {
  console.log('--- [Step 1] モザイク定義処理を開始します ---');

  // 1. Facade・鍵ペアの初期化
  const facade = new SymbolFacade('testnet');
  const keyPair = new KeyPair(new PrivateKey(PRIVATE_KEY));
  const signerAddress = facade.network.publicKeyToAddress(keyPair.publicKey);

  console.log(`送信アカウント: ${signerAddress.toString()}`);

  // 2. モザイクNonce と Mosaic ID の生成 (修正箇所)
  const nonce = Math.floor(Math.random() * 0xFFFFFFFF); // 32bit 無作為数値
  
  // generateMosaicId を使用して算定
  const mosaicId = generateMosaicId(signerAddress, nonce);

  // 3. モザイクフラグの設定 (supplyMutable: 1, transferable: 2, revokable: 8 => 11)
  const flags = 1 | 2 | 8; 

  console.log('設定した Mosaic ID:', mosaicId.toString(16).toUpperCase());

  // 4. モザイク定義トランザクション（v1）の作成
  const deadline1 = facade.now().addSeconds(7200).timestamp;
  const mosaicDefTx = facade.transactionFactory.create({
    type: 'mosaic_definition_transaction_v1',
    signerPublicKey: keyPair.publicKey,
    deadline: deadline1,
    id: mosaicId,
    duration: 0n, // 0n = 無期限
    nonce: nonce,
    flags: flags,
    divisibility: 0 // 小数点桁数 (0)
  });

  // 手数料設定
  mosaicDefTx.fee.value = BigInt(mosaicDefTx.size * 100);

  // 署名と Payload 生成
  const signature1 = facade.signTransaction(keyPair, mosaicDefTx);
  const payloadJson1 = facade.transactionFactory.constructor.attachSignature(mosaicDefTx, signature1);
  const txHash1 = facade.hashTransaction(mosaicDefTx).toString();

  console.log(`------------------------------------`);
  console.log(`★ 新しい Mosaic ID: ${mosaicId.toString(16).toUpperCase()}`);
  console.log(`★ 定義 Tx Hash: ${txHash1}`);
  console.log(`------------------------------------`);

  // アナウンス
  const res1 = await fetch(`${NODE_URL}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson1
  });
  console.log('定義トランザクション送信完了:', await res1.json());
  console.log('承認（約35秒）を待っています...');

  await sleep(35000);

  console.log('\n--- [Step 2] モザイク発行量（1,000,000個）の処理を開始します ---');

  // 5. モザイク供給量変更トランザクション（v1）の作成
  const deadline2 = facade.now().addSeconds(7200).timestamp;
  const supplyChangeTx = facade.transactionFactory.create({
    type: 'mosaic_supply_change_transaction_v1',
    signerPublicKey: keyPair.publicKey,
    deadline: deadline2,
    mosaicId: mosaicId,
    delta: 1000000n, // 発行量: 1,000,000
    action: 'increase'
  });

  // 手数料設定
  supplyChangeTx.fee.value = BigInt(supplyChangeTx.size * 100);

  // 署名と Payload 生成
  const signature2 = facade.signTransaction(keyPair, supplyChangeTx);
  const payloadJson2 = facade.transactionFactory.constructor.attachSignature(supplyChangeTx, signature2);
  const txHash2 = facade.hashTransaction(supplyChangeTx).toString();

  console.log(`★ 発行 Tx Hash: ${txHash2}`);

  // アナウンス
  const res2 = await fetch(`${NODE_URL}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson2
  });
  console.log('発行トランザクション送信完了:', await res2.json());
  console.log('承認（約35秒）を待っています...');

  await sleep(35000);

  console.log('\n🎉 🎉 🎉 【モザイク作成完了！】 🎉 🎉 🎉');
  console.log(`👉 新しい Mosaic ID: ${mosaicId.toString(16).toUpperCase()}`);
  console.log('※ Restrictable: false / Revokable: true で作成されました！');
}

createRevokableMosaic().catch(err => {
  console.error('❌ エラーが発生しました:', err);
  process.exit(1);
});