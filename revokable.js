// 組織の秘密鍵のみで各ユーザーの MOSAIC_ID_GIVE を全額回収し、PocketBase の残高を 0 に更新するスクリプト
import 'dotenv/config';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

const PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY;
const POCKETBASE_URL = process.env.POCKETBASE_URL;
const NODE_URL = process.env.SYMBOL_NODE;

const mosaicIdHex = process.env.MOSAIC_ID_GIVE.replace(/^0x/i, '').toLowerCase();
const mosaicId = BigInt(`0x${mosaicIdHex}`);

const pb = new PocketBase(POCKETBASE_URL);

// ノードからユーザーの該当モザイク保有量を取得
async function getMosaicBalance(addressStr, targetMosaicIdHex) {
  try {
    const res = await fetch(`${NODE_URL}/accounts/${addressStr}`);
    if (!res.ok) return 0n;
    const data = await res.json();
    const mosaics = data.account.mosaics || [];
    const match = mosaics.find(m => m.id.toLowerCase() === targetMosaicIdHex);
    return match ? BigInt(match.amount) : 0n;
  } catch (err) {
    return 0n;
  }
}

async function main() {
  const facade = new SymbolFacade('testnet');

  // 組織のアカウント設定
  const orgPrivateKey = new PrivateKey(PRIVATE_KEY.trim());
  const orgKeyPair = new KeyPair(orgPrivateKey);
  const orgAddress = facade.network.publicKeyToAddress(orgKeyPair.publicKey);

  console.log('--- [組織権限による一括全額回収処理開始] ---');
  console.log('管理者（組織）アドレス:', orgAddress.toString());
  console.log('対象モザイクID:', `0x${mosaicIdHex.toUpperCase()}`);

  // 1. PocketBase からユーザー一覧を取得
  console.log('\nPocketBase からユーザー一覧を取得中...');
  const records = await pb.collection('discord_users').getFullList();

  const validRecords = records.filter(r => {
    const addr = r.symbolAddress;
    return addr && typeof addr === 'string' && addr.trim() !== '';
  });

  if (validRecords.length === 0) {
    console.log('❌ 有効なユーザーが見つかりませんでした。');
    return;
  }

  // 2. インナートランザクションの生成と回収対象ユーザーのリストアップ
  console.log('\n各ユーザーの残高を確認中...');
  const innerTransactions = [];
  const retrievedUsers = []; // PocketBase残高更新用の対象リスト

  for (const record of validRecords) {
    const addressStr = (record.symbolAddress).trim();
    const username = record.username || record.discord_id;

    // 最新残高を取得
    const balance = await getMosaicBalance(addressStr, mosaicIdHex);

    if (balance <= 0n) {
      console.log(`⏩ スキップ: ${username} (残高: 0)`);
      continue;
    }

    console.log(`✅ 回収対象: ${username} | 残高: ${balance.toString()} | アドレス: ${addressStr}`);

    const userAddress = new Address(addressStr);

    // モザイク回収（Revocation）トランザクションの作成
    const innerTx = facade.transactionFactory.createEmbedded({
      type: 'mosaic_supply_revocation_transaction_v1',
      signerPublicKey: orgKeyPair.publicKey,
      sourceAddress: userAddress,
      mosaic: {
        mosaicId: mosaicId,
        amount: balance
      }
    });

    innerTransactions.push(innerTx);
    retrievedUsers.push(record); // 更新対象として保存
  }

  if (innerTransactions.length === 0) {
    console.log('\n❌ 回収可能なモザイクを保有しているユーザーがいませんでした。');
    return;
  }

  // 3. アグリゲートコンプリート Tx の構築
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

  aggregateTx.fee.value = BigInt(aggregateTx.size * 100);

  const signature = facade.signTransaction(orgKeyPair, aggregateTx);
  const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);

  const txHash = facade.hashTransaction(aggregateTx).toString();
  console.log('\nTransaction Hash:', txHash);

  // 4. ノードへアナウンス
  console.log('ノードへ送信中...');
  const response = await fetch(`${NODE_URL}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: payloadJson
  });

  const result = await response.json();
  console.log('Announce Result:', result);

  // --------------------------------------------------
  // 5. 【追加】PocketBase の残高（give_balance）を 0 に更新
  // --------------------------------------------------
  if (response.ok || result.message === 'packet 9-accepted') {
    console.log('\n🔄 PocketBase の残高データを更新中...');

    for (const userRecord of retrievedUsers) {
      try {
        await pb.collection('discord_users').update(userRecord.id, {
          give_balance: 0 // 全額回収したため 0 に上書き
        });
        console.log(`  └ 📝 残高更新完了: ${userRecord.username || userRecord.discord_id} ➔ give_balance: 0`);
      } catch (dbErr) {
        console.error(`  └ ⚠️ PB更新失敗 (${userRecord.id}):`, dbErr.message);
      }
    }
    console.log('\n✨ 全ての処理が完了しました！');
  } else {
    console.error('\n❌ ノードへの送信に失敗したため、PocketBase の残高更新をスキップしました。');
  }
}

main().catch(err => {
  console.error('❌ エラーが発生しました:', err);
});