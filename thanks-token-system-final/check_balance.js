import 'dotenv/config';

// 設定値
const TARGET_ADDRESS = process.env.TEST_USER_ADDRESS || 'TB3U4UP44CFQO4FNN4XSFQRJLZW22DVXANEYJOI';
const TARGET_MOSAIC_ID = '1F3580C7185B2192';
const NODE_URL = (process.env.SYMBOL_NODE || 'https://sym-test-01.rio-symbol.com:3001').replace(/\/$/, '');

async function checkMosaicBalance() {
  const cleanAddress = TARGET_ADDRESS.replace(/-/g, '').trim().toUpperCase();
  console.log(`🔍 アドレス: ${cleanAddress}`);
  console.log(`🎯 対象モザイクID: ${TARGET_MOSAIC_ID}`);

  try {
    // アカウント情報を取得
    const res = await fetch(`${NODE_URL}/accounts/${cleanAddress}`);
    
    if (!res.ok) {
      if (res.status === 404) {
        console.log('\n❌ アカウントが未アクティベート（オンチェーン履歴なし）のため、保有量は 0 です。');
        return;
      }
      throw new Error(`HTTP Error: ${res.status}`);
    }

    const accountData = await res.json();
    const mosaics = accountData.account?.mosaics || [];

    // モザイクIDの一致検索
    const targetMosaic = mosaics.find(
      m => m.id.toUpperCase() === TARGET_MOSAIC_ID.toUpperCase()
    );

    const amount = targetMosaic ? targetMosaic.amount : '0';

    console.log('\n====================================');
    console.log(`🟢 保有量: ${amount}`);
    console.log('====================================\n');
  } catch (error) {
    console.error('❌ エラー:', error.message);
  }
}

checkMosaicBalance();