import 'dotenv/config';
import PocketBase from 'pocketbase';
import { PrivateKey } from 'symbol-sdk';
import { SymbolFacade, KeyPair, Address } from 'symbol-sdk/symbol';

const POCKETBASE_URL = process.env.POCKETBASE_URL;
const SYMBOL_NODE = process.env.SYMBOL_NODE;
const SYMBOL_PRIVATE_KEY = process.env.SYMBOL_PRIVATE_KEY;
const MOSAIC_ID_POINT = process.env.MOSAIC_ID_POINT;
const MOSAIC_ID_TICKET_DRINK = process.env.MOSAIC_ID_TICKET_DRINK;

const pb = new PocketBase(POCKETBASE_URL);

/**
 * PocketBase 管理者認証ヘルパー
 */
async function ensureAdminAuth() {
  if (process.env.PB_ADMIN_EMAIL && process.env.PB_ADMIN_PASSWORD) {
    try {
      if (pb.admins) {
        await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      } else {
        await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
      }
    } catch (err) {
      console.warn('⚠️ PB 管理者認証スキップ:', err.message);
    }
  }
}

/**
 * ポイント回収および商品・チケット引き渡しトランザクションの実行
 * @param {string} discordId ユーザーの Discord ID
 * @param {Object} item 購入対象の商品オブジェクト
 * @param {string} userName ユーザーの表示名
 */
export async function executePointRevocation(discordId, item, userName) {
  try {
    await ensureAdminAuth();

    // 1. ユーザーレコード取得
    const userList = await pb.collection('discord_users').getList(1, 1, {
      filter: `discordId="${discordId}"`
    });

    if (userList.items.length === 0) {
      return { success: false, error: '❌ ユーザー情報が PocketBase に登録されていません。' };
    }

    const userRecord = userList.items[0];
    if (!userRecord.symbolAddress) {
      return { success: false, error: '❌ Symbol アドレスが登録されていません。' };
    }

    const currentBalance = userRecord.point_balance || 0;
    if (currentBalance < item.price) {
      return { success: false, error: '❌ 保有ポイントが足りません。' };
    }

    const cleanAddrStr = userRecord.symbolAddress.replace(/-/g, '').trim().toUpperCase();
    const userAddress = new Address(cleanAddrStr);

    // 2. Symbol トランザクション構築
    const facade = new SymbolFacade('testnet');
    const adminKeyPair = new KeyPair(new PrivateKey(SYMBOL_PRIVATE_KEY.trim()));

    const pointMosaicIdHex = (MOSAIC_ID_POINT || '').replace(/^0x/i, '').padStart(16, '0').toLowerCase();
    const pointMosaicId = BigInt(`0x${pointMosaicIdHex}`);

    const innerTransactions = [];

    // インナートランザクション 1: POINT モザイク回収
    const revokePointTx = facade.transactionFactory.createEmbedded({
      type: 'mosaic_supply_revocation_transaction_v1',
      signerPublicKey: adminKeyPair.publicKey,
      sourceAddress: userAddress,
      mosaic: {
        mosaicId: pointMosaicId,
        amount: BigInt(item.price)
      }
    });
    innerTransactions.push(revokePointTx);

    let generatedTicketId = null;

    // インナートランザクション 2（チケット商品の場合）:
    // チケットモザイクの送金 ＆ オンチェーンメッセージ刻印（TICKET_ISSUE:TKT-xxx）
    if (item.type === 'ticket') {
      generatedTicketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

      const ticketMosaicIdHex = (MOSAIC_ID_TICKET_DRINK || '').replace(/^0x/i, '').padStart(16, '0').toLowerCase();
      const ticketMosaicId = BigInt(`0x${ticketMosaicIdHex}`);

      const sendTicketTx = facade.transactionFactory.createEmbedded({
        type: 'transfer_transaction_v1',
        signerPublicKey: adminKeyPair.publicKey,
        recipientAddress: userAddress,
        mosaics: [
          {
            mosaicId: ticketMosaicId,
            amount: 1n
          }
        ],
        message: new Uint8Array([0x00, ...Buffer.from(`TICKET_ISSUE:${generatedTicketId}`)])
      });
      innerTransactions.push(sendTicketTx);
    }

    // アグリゲート Complete トランザクションの組み立て
    const merkleHash = facade.static.hashEmbeddedTransactions(innerTransactions);
    const deadline = facade.now().addSeconds(7200).timestamp;

    const aggregateTx = facade.transactionFactory.create({
      type: 'aggregate_complete_transaction_v3',
      signerPublicKey: adminKeyPair.publicKey,
      fee: 0n,
      deadline: deadline,
      transactionsHash: merkleHash,
      transactions: innerTransactions
    });

    aggregateTx.fee.value = BigInt(aggregateTx.size * 200);

    const signature = facade.signTransaction(adminKeyPair, aggregateTx);
    const payloadJson = facade.transactionFactory.constructor.attachSignature(aggregateTx, signature);

    // ノードへアナウンス
    const response = await fetch(`${SYMBOL_NODE}/transactions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payloadJson
    });

    const result = await response.json();
    console.log('🛍️ 商品購入 Aggregate Tx 結果:', result);

    if (!response.ok && result.message !== 'packet 9 was pushed to the network via /transactions') {
      return { success: false, error: '❌ ブロックチェーンへの送信に失敗しました。' };
    }

    // 3. PocketBase 側の残高更新
    const newBalance = currentBalance - item.price;
    await pb.collection('discord_users').update(userRecord.id, {
      point_balance: newBalance
    });

    // 4. チケット商品の場合は PocketBase の tickets コレクションへ保存
    if (item.type === 'ticket' && generatedTicketId) {
      await pb.collection('tickets').create({
        ticketId: generatedTicketId,
        discordId: discordId,
        userName: userName,
        itemName: item.name,
        itemId: item.id,
        status: 'unused',
        usedAt: ''
      });
    }

    return {
      success: true,
      newBalance: newBalance,
      ticketId: generatedTicketId
    };

  } catch (err) {
    console.error('❌ executePointRevocation エラー:', err);
    if (err.data) {
      console.error('🔍 PB エラー詳細:', JSON.stringify(err.data, null, 2));
    }
    return { success: false, error: `❌ 処理中にエラーが発生しました: ${err.message}` };
  }
}