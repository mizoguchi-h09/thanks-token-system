// 組織の秘密鍵のみで各ユーザーの MOSAIC_ID_GIVE を全額回収し、PocketBase の残高を回収分だけ減算更新するスクリプト
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
    // 404エラー防止のためハイフンを除去
    const cleanAddress = addressStr.replace(/-/g, '').trim();
    const res = await fetch(`${NODE_URL}/accounts/${cleanAddress}`);
    if (!res.ok) return 0n;
    const data = await res.json();
    const mosaics = data.account.mosaics || [];

    // BigIntでモザイクIDを正確に比較
    const targetId = BigInt(`0x${targetMosaicIdHex}`);
    const match = mosaics.find(m => BigInt(`0x${m.id}`) === targetId);
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
  const retrievedUsers = []; // PocketBase残高更新用の対象リスト（回収額も保持）

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

    const userAddress = new Address(addressStr.replace(/-/g, ''));

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
    // 回収対象レコードと回収した数量（Number化）をペアで保存
    retrievedUsers.push({
      record: record,
      revokedAmount: Number(balance)
    });
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

  const isAccepted = response.ok || (result.message && result.message.includes('packet 9'));

  // --------------------------------------------------
  // 5. ブロックチェーン上での承認（Confirmed）を確認後、PocketBase をマイナス更新
  // --------------------------------------------------
  if (isAccepted) {
    console.log('\n⏳ ブロックチェーン上での承認（Confirmed）を待機中...');
    let isConfirmed = false;

    // 5秒ごとに最大12回（計60秒）ステータスを確認
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        const statusRes = await fetch(`${NODE_URL}/transactionStatus/${txHash}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          console.log(`  └ ステータス確認 [${i + 1}/12]:`, statusData.group);

          if (statusData.group === 'confirmed') {
            isConfirmed = true;
            break;
          } else if (statusData.group === 'failed') {
            console.error(`❌ トランザクションが拒否されました。理由: ${statusData.code}`);
            break;
          }
        }
      } catch (e) {}
    }

    if (isConfirmed) {
      console.log('\n✅ オンチェーンで承認を確認しました！PocketBase の残高データを更新中...');

      for (const item of retrievedUsers) {
        try {
          const currentGive = item.record.give_balance || 0;
          // 回収した分だけマイナスした値（0未満にはならないように制御）
          const newGive = Math.max(0, currentGive - item.revokedAmount);

          await pb.collection('discord_users').update(item.record.id, {
            give_balance: newGive
          });
          
          const username = item.record.username || item.record.discord_id;
          console.log(`  └ 📝 残高更新完了: ${username} ➔ give_balance: ${newGive} (回収額: -${item.revokedAmount})`);
        } catch (dbErr) {
          console.error(`  └ ⚠️ PB更新失敗 (${item.record.id}):`, dbErr.message);
        }
      }
      console.log('\n✨ 全ての処理が完了しました！');
    } else {
      console.error('\n❌ オンチェーン上で承認されなかったため、PocketBase の残高更新をキャンセルしました。');
    }
  } else {
    console.error('\n❌ ノードへの送信に失敗したため、PocketBase の残高更新をスキップしました。');
  }
}

main().catch(err => {
  console.error('❌ エラーが発生しました:', err);
});