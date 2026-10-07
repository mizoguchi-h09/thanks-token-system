//ECサイトで交換する際の取引処理を行う

import 'dotenv/config';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

// 1. 各種環境変数の読み込み
const PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY;
const POCKETBASE_URL = process.env.POCKETBASE_URL;
const NODE_URL = process.env.SYMBOL_NODE;

// Point モザイク ID の整形 (0xプレフィックスの除去)
const mosaicIdHex = (process.env.MOSAIC_ID_POINT || '0000000000000000')
  .replace(/^0x/i, '')
  .toLowerCase();
const mosaicId = BigInt(`0x${mosaicIdHex}`);

const pb = new PocketBase(POCKETBASE_URL);

/**
 * PocketBase の管理者ログイン（設定されている場合）
 */
async function ensureAdminAuth() {
  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    try {
      await pb.admins.authWithPassword(
        process.env.PB_ADMIN_EMAIL,
        process.env.PB_ADMIN_PASSWORD
      );
    } catch (err) {
      console.warn('[PB Debug] Admin ログインスキップまたは失敗:', err.message);
    }
  }
}

/**
 * ノードから指定アドレスの Point 最新保有量を取得する関数
 * @param {string} addressStr - Symbol アドレス文字列
 * @returns {Promise<bigint>} 保有している Point 量
 */
export async function getMosaicBalance(addressStr) {
  try {
    const res = await fetch(`${NODE_URL}/accounts/${addressStr}`);
    if (!res.ok) return 0n;
    const data = await res.json();
    const mosaics = data.account?.mosaics || [];
    const match = mosaics.find(m => m.id.toLowerCase() === mosaicIdHex);
    return match ? BigInt(match.amount) : 0n;
  } catch (err) {
    console.error('[PB/Node Debug] モザイク残高取得エラー:', err);
    return 0n;
  }
}

/**
 * 組織（Bot）権限によりユーザーのアカウントから Point を回収し、PocketBase の残高更新およびチケット作成を行う処理
 * @param {string} discordId - 購入を行ったユーザーの Discord ID
 * @param {object|number} itemInput - 商品オブジェクト または 価格(数値)
 * @param {string} [userName] - Discord のユーザー名 (追加)
 * @returns {Promise<{success: boolean, newBalance?: number, ticketId?: string, error?: string}>}
 */
export async function executePointRevocation(discordId, itemInput, userName = '') {
  try {
    // 0. 管理者権限での PocketBase 接続準備
    await ensureAdminAuth();

    // 引数がオブジェクト(item)か数値(price)かを自動判別
    const itemPrice = typeof itemInput === 'object' ? itemInput.price : itemInput;
    const itemObj = typeof itemInput === 'object' ? itemInput : null;

    console.log(`[PB Debug] 検索対象 Discord ID: "${discordId}" (ユーザー名: ${userName})`);

    // 1. PocketBase から該当ユーザー情報を取得
    let userRecord = null;
    try {
      userRecord = await pb.collection('discord_users').getFirstListItem(
        `discordId="${String(discordId)}"`
      );
      console.log('[PB Debug] レコード取得成功:', userRecord.id);
    } catch (pbErr) {
      console.error('[PB Debug] ユーザー取得失敗:', pbErr.status, pbErr.message);
      if (pbErr.data) console.error('[PB Debug] 詳細:', JSON.stringify(pbErr.data));
    }

    if (!userRecord || !userRecord.symbolAddress) {
      return { 
        success: false, 
        error: `❌ アカウント情報が見つかりません (ID: ${discordId})。\n/register で再登録するか確認してください。` 
      };
    }

    const userAddressStr = userRecord.symbolAddress.trim();

    // 2. オンチェーン上の Point 最新残高を確認
    const currentBalance = await getMosaicBalance(userAddressStr);
    const requiredAmount = BigInt(itemPrice); // 数値(itemPrice)から安全に BigInt 化

    if (currentBalance < requiredAmount) {
      return { 
        success: false, 
        error: `❌ Point 残高が不足しています。（保有: ${currentBalance.toString()} pt / 必要: ${itemPrice} pt）` 
      };
    }

    // 3. Symbol SDK v3 (SymbolFacade) を使用したトランザクション構築
    const facade = new SymbolFacade('testnet');
    const orgPrivateKey = new PrivateKey(PRIVATE_KEY.trim());
    const orgKeyPair = new KeyPair(orgPrivateKey);
    const userAddress = new Address(userAddressStr);

    // モザイク回収（Revocation）インナートランザクションの生成
    const innerTx = facade.transactionFactory.createEmbedded({
      type: 'mosaic_supply_revocation_transaction_v1',
      signerPublicKey: orgKeyPair.publicKey,
      sourceAddress: userAddress,
      mosaic: {
        mosaicId: mosaicId,
        amount: requiredAmount
      }
    });

    // アグリゲートコンプリート Tx の構築
    const merkleHash = facade.static.hashEmbeddedTransactions([innerTx]);
    const deadline = facade.now().addSeconds(7200).timestamp;

    const aggregateTx = facade.transactionFactory.create({
      type: 'aggregate_complete_transaction_v3',
      signerPublicKey: orgKeyPair.publicKey,
      fee: 0n,
      deadline: deadline,
      transactionsHash: merkleHash,
      transactions: [innerTx]
    });

    aggregateTx.fee.value = BigInt(aggregateTx.size * 100);

    // 組織の鍵で署名・ペイロード作成
    const signature = facade.signTransaction(orgKeyPair, aggregateTx);
    const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);

    // 4. Symbol ノードへ送信 (アナウンス)
    const response = await fetch(`${NODE_URL}/transactions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payloadJson
    });

    const result = await response.json();

    if (!response.ok && result.message !== 'packet 9-accepted') {
      throw new Error(`Node announce error: ${JSON.stringify(result)}`);
    }

    // 5. 決済成功後、PocketBase の point_balance を減算更新
    const newBalance = Number(currentBalance - requiredAmount);
    await pb.collection('discord_users').update(userRecord.id, {
      point_balance: newBalance
    });

    // 6. チケットレコードの新規発行 (itemObj が存在する場合)
    let ticketId = null;
    if (itemObj) {
      const ticketData = {
        discordId: String(discordId),
        userName: userName,
        itemId: itemObj.id,
        itemName: itemObj.name,
        status: 'unused'
      };

      console.log('[PB Debug] チケット作成試行データ:', ticketData);
      const ticketRecord = await pb.collection('tickets').create(ticketData);
      ticketId = ticketRecord.id;
      console.log(`[PB Debug] チケット発行成功 (ID: ${ticketId})`);
    }

    return {
      success: true,
      newBalance: newBalance,
      ticketId: ticketId
    };

  } catch (error) {
    console.error('Point 回収処理エラー (shop_transaction.js):', error);
    if (error.data) {
      console.error('[PB Error Data]:', JSON.stringify(error.data, null, 2));
    }
    return { 
      success: false, 
      error: `❌ 決済トランザクションの処理中にエラーが発生しました。（${error.message || '詳細不明'}）` 
    };
  }
}