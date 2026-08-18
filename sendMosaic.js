//組織からユーザに一括配布用ファイル

import 'dotenv/config';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

// --------------------------------------------------
// 1. 設定値の読み込みと変数の初期化
// --------------------------------------------------
const PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY;
const POCKETBASE_URL = process.env.POCKETBASE_URL;
const NODE_URL = process.env.SYMBOL_NODE;

// .env からモザイクID（文字列）を取得し、16進数 BigInt に変換
const mosaicIdHex = process.env.MOSAIC_ID_GIVE;
const mosaicId = BigInt(`0x${mosaicIdHex.replace(/^0x/i, '')}`);

const pb = new PocketBase(POCKETBASE_URL);

async function main() {
  const facade = new SymbolFacade('testnet');

  // 送信元アカウントの準備
  const orgPrivateKey = new PrivateKey(PRIVATE_KEY.trim());
  const orgKeyPair = new KeyPair(orgPrivateKey);
  const orgAddress = facade.network.publicKeyToAddress(orgKeyPair.publicKey);

  console.log('--- [処理開始] ---');
  console.log('送信元アドレス:', orgAddress.toString());
  console.log('対象モザイクID:', `0x${mosaicId.toString(16).toUpperCase()}`);

 // --------------------------------------------------
  // 2. PocketBase からユーザーアドレスを取得
  // --------------------------------------------------
  console.log('\nPocketBase からユーザー一覧を取得中...');
  
  const records = await pb.collection('discord_users').getFullList();

  console.log(`データ総数: ${records.length}件`);

  // JS側で有効なアドレスを持つレコードのみを抽出（フィールド名表記揺れにも対応）
  const validRecords = records.filter((record) => {
    const addr = record.symbolAddress;
    return addr && typeof addr === 'string' && addr.trim() !== '';
  });

  if (validRecords.length === 0) {
    console.log('❌ 有効なアドレスを持つユーザーが見つかりませんでした。処理を終了します。');
    if (records.length > 0) {
      console.log('\n--- [参考] 1件目のデータ構造（フィールド名をご確認ください）---');
      console.log(records[0]);
    }
    return;
  }

  // --------------------------------------------------
  // 対象者の詳細ログ表示
  // --------------------------------------------------
  console.log(`\n✅ 送信対象者: 計 ${validRecords.length} 名`);
  console.log('--------------------------------------------------');
  validRecords.forEach((record, index) => {
    // フィールド名に合わせたアドレスとユーザー名の取得
    const address = (record.symbolAddress).trim();
    const username = record.username;
    
    console.log(`[${index + 1}] 名前/Discord: ${username}`);
    console.log(`    アドレス: ${address}`);
    console.log(`    PB Record ID: ${record.id}`);
    console.log('--------------------------------------------------');
  });

  // --------------------------------------------------
  // 3. インナートランザクションの動的生成
  // --------------------------------------------------
  const innerTransactions = validRecords.map((record) => {
    const addressStr = (record.symbolAddress).trim();
    const recipientAddress = new Address(addressStr);

    return facade.transactionFactory.createEmbedded({
      type: 'transfer_transaction_v1',
      signerPublicKey: orgKeyPair.publicKey,
      recipientAddress: recipientAddress,
      mosaics: [
        {
          mosaicId: mosaicId,
          amount: 10n // 各ユーザーに 10 トークン配布
        }
      ]
    });
  });

  // --------------------------------------------------
  // 4. アグリゲートトランザクション（v3）の構築と署名
  // --------------------------------------------------
  const merkleHash = facade.static.hashEmbeddedTransactions(innerTransactions);
  const deadline = facade.now().addSeconds(7200).timestamp;

  const aggregateTx = facade.transactionFactory.create({
    type: 'aggregate_complete_transaction_v3',
    signerPublicKey: orgKeyPair.publicKey,
    fee: 0n,
    deadline: deadline,
    transactionsHash: merkleHash,
    transactions: innerTransactions
  });

  // 手数料設定
  aggregateTx.fee.value = BigInt(aggregateTx.size * 100);

  // 署名と Payload JSON の生成
  const signature = facade.signTransaction(orgKeyPair, aggregateTx);
  const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);

  const txHash = facade.hashTransaction(aggregateTx).toString();
  console.log('\nTransaction Hash:', txHash);

  // --------------------------------------------------
  // 5. ノードへアナウンス
  // --------------------------------------------------
  console.log('ノードへトランザクションを送信中...');
  const response = await fetch(`${NODE_URL}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson
  });

  const result = await response.json();
  console.log('Announce Result:', result);
}

main().catch((err) => {
  console.error('❌ エラーが発生しました:', err);
});