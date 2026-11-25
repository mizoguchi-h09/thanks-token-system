import 'dotenv/config';
import { PrivateKey } from 'symbol-sdk';
import { NetworkTimestamp, SymbolFacade, generateMosaicAliasId, models } from 'symbol-sdk/symbol';

const NODE_URL = process.env.NODE_URL || 'https://reference.symboltest.net:3001';
const WS_URL = NODE_URL.replace(/^http/, 'ws') + '/ws';
const RECIPIENT_ADDRESS = 'TCLDGW4XGTCN27KUUV3BGMACF25RJ6XMCST6XTI';

const privateKeyHex = process.env.SIGNER_PRIVATE_KEY;
if (!privateKeyHex) {
  console.error('エラー: 秘密鍵が設定されていません。');
  process.exit(1);
}

const signerKeyPair = new SymbolFacade.KeyPair(new PrivateKey(privateKeyHex));
const facade = new SymbolFacade('testnet');
const MONITOR_ADDRESS = facade.network.publicKeyToAddress(signerKeyPair.publicKey).toString();

try {
  console.log('送金処理を開始します...');

  const websocket = new WebSocket(WS_URL);
  const uid = await new Promise((resolve) => {
    websocket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.uid) resolve(message.uid);
    }, { once: true });
  });

  const channels = [`confirmedAdded/${MONITOR_ADDRESS}`, `status/${MONITOR_ADDRESS}`];
  for (const channel of channels) {
    websocket.send(JSON.stringify({ uid, subscribe: channel }));
  }

  const timeResponse = await fetch(`${NODE_URL}/node/time`);
  const timeJSON = await timeResponse.json();
  const timestamp = new NetworkTimestamp(timeJSON.communicationTimestamps.receiveTimestamp);

  const feeResponse = await fetch(`${NODE_URL}/network/fees/transaction`);
  const feeJSON = await feeResponse.json();
  const feeMultiplier = Math.max(feeJSON.medianFeeMultiplier, feeJSON.minFeeMultiplier);

  const transaction = facade.transactionFactory.create({
    type: 'transfer_transaction_v1',
    signerPublicKey: signerKeyPair.publicKey.toString(),
    deadline: timestamp.addHours(2).timestamp,
    recipientAddress: RECIPIENT_ADDRESS,
    mosaics: [{ mosaicId: generateMosaicAliasId('symbol.xym'), amount: 1_000_000n }]
  });
  transaction.fee = new models.Amount(BigInt(feeMultiplier * transaction.size));

  const signature = facade.signTransaction(signerKeyPair, transaction);
  const jsonPayload = facade.transactionFactory.static.attachSignature(transaction, signature);
  const transactionHash = facade.hashTransaction(transaction).toString();

  const confirmationPromise = new Promise((resolve, reject) => {
    websocket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const channelName = message.topic?.split('/')[0];

      if (channelName === 'confirmedAdded' && message.data?.meta?.hash === transactionHash) {
        console.log('送金成功（支払いが完了しました）');
        websocket.close();
        resolve();
      }

      if (channelName === 'status' && message.data?.hash === transactionHash) {
        console.error(`送金失敗（理由: ${message.data.code}）`);
        websocket.close();
        reject(new Error());
      }
    });
  });

  await fetch(`${NODE_URL}/transactions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: jsonPayload
  });

  await confirmationPromise;

} catch (e) {
  // 内部エラー用
}