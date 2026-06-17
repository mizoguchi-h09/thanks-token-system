const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "非対面P2Pリアルタイムトークン決済ブロックチェーンシステム";

// Color palette: Deep navy + teal accent + white
const C = {
  navy: "1C2B4A",
  navyLight: "2A3F6B",
  teal: "0D9488",
  tealLight: "CCFBF1",
  white: "FFFFFF",
  offWhite: "F8FAFC",
  gray: "64748B",
  lightGray: "E2E8F0",
  dark: "1E293B",
  accent: "F59E0B",
};

// ─────────────────────────────────────────────────────────────────────
// Slide 1: Title
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.navy };

  // Decorative teal circle (background motif)
  slide.addShape(pres.shapes.OVAL, {
    x: 7.8, y: -1.0, w: 4.5, h: 4.5,
    fill: { color: C.teal, transparency: 75 },
    line: { color: C.teal, transparency: 75 }
  });
  slide.addShape(pres.shapes.OVAL, {
    x: -1.0, y: 3.5, w: 3.0, h: 3.0,
    fill: { color: C.teal, transparency: 80 },
    line: { color: C.teal, transparency: 80 }
  });

  // Journal tag
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.6, y: 0.5, w: 2.8, h: 0.38,
    fill: { color: C.teal },
    line: { color: C.teal },
    rectRadius: 0.05
  });
  slide.addText("Applied Sciences 2023", {
    x: 0.6, y: 0.5, w: 2.8, h: 0.38,
    fontSize: 11, color: C.white, bold: true, align: "center", valign: "middle", margin: 0
  });

  // Main title
  slide.addText("非対面P2Pリアルタイム\nトークン決済", {
    x: 0.6, y: 1.15, w: 8.8, h: 2.0,
    fontSize: 40, color: C.white, bold: true, align: "left", valign: "middle"
  });
  slide.addText("ブロックチェーンシステム", {
    x: 0.6, y: 2.85, w: 8.8, h: 0.9,
    fontSize: 30, color: C.tealLight, bold: false, align: "left"
  });

  // Authors
  slide.addText("Ko, H.-J.; Han, S.-S.; Jeong, C.-S.", {
    x: 0.6, y: 3.9, w: 8.0, h: 0.4,
    fontSize: 13, color: "A0B0CC", align: "left"
  });
  slide.addText("Korea University / Kangwon National University", {
    x: 0.6, y: 4.28, w: 8.0, h: 0.35,
    fontSize: 12, color: "7A90B0", align: "left"
  });

  // Slide number
  slide.addText("1 / 7", {
    x: 8.8, y: 5.2, w: 1.0, h: 0.3,
    fontSize: 10, color: "5A7090", align: "right"
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 2: 研究背景
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.offWhite };

  // Title bar
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("研究背景", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 28, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("2 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  // Three cards
  const cards = [
    {
      icon: "🎣",
      title: "ボイスフィッシング被害の拡大",
      body: "巧妙化する詐欺により個人情報が流出し、金融被害が急増。オープンバンキングシステムへの依存が脆弱性を生む。"
    },
    {
      icon: "🔐",
      title: "非対面取引の課題",
      body: "本人確認・取引の完全性確保・取引否認防止が難しく、安全な金融サービスの導入を阻害している。"
    },
    {
      icon: "⛽",
      title: "既存ブロックチェーンの限界",
      body: "秘密鍵の管理困難・ガス（手数料）不足問題・MetaMaskのデバイス依存など、一般ユーザーへの普及が進まない。"
    }
  ];

  cards.forEach((c, i) => {
    const x = 0.35 + i * 3.15;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: 1.05, w: 2.95, h: 4.2,
      fill: { color: C.white },
      line: { color: C.lightGray },
      rectRadius: 0.12,
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.08 }
    });
    slide.addText(c.icon, {
      x, y: 1.2, w: 2.95, h: 0.7,
      fontSize: 32, align: "center"
    });
    slide.addText(c.title, {
      x: x + 0.15, y: 2.0, w: 2.65, h: 0.75,
      fontSize: 13, color: C.navy, bold: true, align: "center", valign: "top"
    });
    slide.addText(c.body, {
      x: x + 0.15, y: 2.85, w: 2.65, h: 2.2,
      fontSize: 11.5, color: C.dark, align: "left", valign: "top"
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 3: 研究目的
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("研究目的", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 28, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("3 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  // Goal statement box
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 1.0, w: 9.2, h: 0.85,
    fill: { color: C.teal, transparency: 10 },
    line: { color: C.teal },
    rectRadius: 0.08
  });
  slide.addText("個人が安全・簡便に利用できる「非対面P2Pリアルタイムトークン決済システム」の構築", {
    x: 0.4, y: 1.0, w: 9.2, h: 0.85,
    fontSize: 15, color: C.white, bold: true, align: "center", valign: "middle", margin: 0
  });

  // 5 goals
  const goals = [
    ["🔑", "秘密鍵のサーバー側管理", "キーストアファイル＋DBに保存し、デバイス紛失や変更による鍵漏洩リスクをゼロに"],
    ["⛽", "ガス自動チャージ", "ガス不足時にシステムが自動補充。ユーザーはガス管理不要でトークン送金可能"],
    ["✅", "取引完全性・否認防止", "トランザクションIDを用いた検証モジュールにより、個人情報を露出せず取引を証明"],
    ["🛡️", "DDoS防御・海外IPブロック", "国内IPのみ許可し、ブラックリストDBで総当たり攻撃を防御"],
    ["📱", "プラットフォーム非依存UI", "Flatterで構築されたWebアプリでスマートフォン・PC問わず同一UIを提供"],
  ];

  goals.forEach((g, i) => {
    const y = 2.05 + i * 0.65;
    slide.addText(g[0], { x: 0.4, y, w: 0.5, h: 0.55, fontSize: 18, align: "center" });
    slide.addText(g[1], { x: 0.95, y, w: 2.5, h: 0.55, fontSize: 13, color: C.navy, bold: true, valign: "middle" });
    slide.addText(g[2], { x: 3.5, y, w: 6.1, h: 0.55, fontSize: 12, color: C.dark, valign: "middle" });
    if (i < 4) {
      slide.addShape(pres.shapes.LINE, {
        x: 0.4, y: y + 0.58, w: 9.2, h: 0,
        line: { color: C.lightGray, width: 0.75 }
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 4: 従来手法と課題
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("従来手法と課題", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 28, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("4 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  const rows = [
    ["ウォレット種別", "利便性", "主な課題"],
    ["Webウォレット", "◎ 高い", "DDoS脆弱性・鍵移行時の露出リスク"],
    ["MetaMask\n（ブラウザ拡張）", "○ 高い", "拡張削除でLevelDB消去→鍵完全喪失・デバイス変更で露出"],
    ["モバイルウォレット", "○ 携帯性高い", "スマホ紛失で鍵喪失・機種変更時に鍵露出"],
    ["デスクトップウォレット", "△ PC限定", "PCクラッシュで喪失・サード管理では費用発生"],
    ["ERC-20 / MetaMask\n（既存ブロックチェーン）", "△ 複雑", "Solidity開発が必要・ガス管理がユーザー負担・鍵がデバイス依存"],
  ];

  const colWidths = [2.3, 1.5, 5.4];
  const rowHeight = 0.68;
  const tableY = 1.0;

  rows.forEach((row, ri) => {
    const rowY = tableY + ri * rowHeight;
    const isHeader = ri === 0;
    const bgColor = isHeader ? C.navyLight : (ri % 2 === 0 ? "F1F5F9" : C.white);
    const textColor = isHeader ? C.white : C.dark;

    let cx = 0.35;
    row.forEach((cell, ci) => {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: cx, y: rowY, w: colWidths[ci], h: rowHeight,
        fill: { color: bgColor },
        line: { color: C.lightGray, width: 0.5 }
      });
      slide.addText(cell, {
        x: cx + 0.08, y: rowY, w: colWidths[ci] - 0.16, h: rowHeight,
        fontSize: ci === 0 ? 11 : 11,
        color: textColor,
        bold: isHeader,
        valign: "middle",
        align: ci === 1 ? "center" : "left"
      });
      cx += colWidths[ci];
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 5: 提案手法
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("提案手法：システムアーキテクチャ", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 26, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("5 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  const modules = [
    { icon: "🔑", title: "鍵管理モジュール", color: "1C4E80", lines: ["256ビット乱数で秘密鍵生成", "キーストア（ファイル＋DB）に保存", "パスフレーズで復号→署名"] },
    { icon: "🪙", title: "トークン管理モジュール", color: "065A82", lines: ["SCT-20でトークンを簡単作成", "発行量の増減（Mint/Burn）", "RPC経由でブロックチェーンに登録"] },
    { icon: "💸", title: "トークン送金モジュール", color: "1C7293", lines: ["ガス残高を自動確認・補充", "Symverseノードへ送信", "受領確認・結果をUIに返却"] },
    { icon: "🛡️", title: "DDoS防御モジュール", color: "21295C", lines: ["国内IPのみ許可（SQLite管理）", "攻撃元IPをブラックリスト登録", "メインDBを切り離し保護"] },
    { icon: "👤", title: "本人確認モジュール", color: "028090", lines: ["名前・電話番号・生年月日入力", "SMS応答コードで本人確認", "信用情報機関と連携して検証"] },
  ];

  const startX = 0.3;
  const cardW = 1.82;
  const cardH = 3.85;
  const cardY = 1.05;

  modules.forEach((m, i) => {
    const x = startX + i * (cardW + 0.1);
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: cardY, w: cardW, h: cardH,
      fill: { color: m.color },
      line: { color: m.color },
      rectRadius: 0.1,
      shadow: { type: "outer", color: "000000", blur: 8, offset: 2, angle: 45, opacity: 0.15 }
    });
    slide.addText(m.icon, { x, y: cardY + 0.15, w: cardW, h: 0.55, fontSize: 24, align: "center" });
    slide.addText(m.title, {
      x: x + 0.1, y: cardY + 0.72, w: cardW - 0.2, h: 0.7,
      fontSize: 11, color: C.white, bold: true, align: "center", valign: "top"
    });
    slide.addShape(pres.shapes.LINE, {
      x: x + 0.15, y: cardY + 1.42, w: cardW - 0.3, h: 0,
      line: { color: "FFFFFF", transparency: 60, width: 0.5 }
    });
    m.lines.forEach((line, li) => {
      slide.addText([
        { text: "▸ ", options: { color: C.accent, bold: true } },
        { text: line, options: { color: "D4E6F1" } }
      ], {
        x: x + 0.1, y: cardY + 1.55 + li * 0.68, w: cardW - 0.2, h: 0.65,
        fontSize: 10, valign: "top"
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 6: 実験結果
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.offWhite };

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navy }, line: { color: C.navy }
  });
  slide.addText("実験結果", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 28, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("6 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  // Left: Wallet creation chart
  slide.addText("① ウォレット作成レスポンスタイム", {
    x: 0.35, y: 0.95, w: 4.4, h: 0.38,
    fontSize: 13, color: C.navy, bold: true
  });
  slide.addChart(pres.charts.BAR, [
    {
      name: "DDoSなし（平均ms）",
      labels: ["10ユーザー", "20ユーザー", "50ユーザー"],
      values: [323, 647, 1633]
    },
    {
      name: "DDoSあり（平均ms）",
      labels: ["10ユーザー", "20ユーザー", "50ユーザー"],
      values: [305, 609, 1532]
    }
  ], {
    x: 0.35, y: 1.33, w: 4.5, h: 3.1,
    barDir: "col",
    chartColors: [C.teal, C.accent],
    chartArea: { fill: { color: C.white }, roundedCorners: true },
    catAxisLabelColor: C.gray,
    valAxisLabelColor: C.gray,
    valGridLine: { color: C.lightGray, size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelPosition: "outEnd",
    dataLabelColor: C.dark,
    dataLabelFontSize: 9,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 10,
  });

  // Right: Balance inquiry
  slide.addText("② 残高照会レスポンスタイム (TPS)", {
    x: 5.2, y: 0.95, w: 4.5, h: 0.38,
    fontSize: 13, color: C.navy, bold: true
  });
  slide.addChart(pres.charts.BAR, [
    {
      name: "DDoSなし（TPS）",
      labels: ["50スレッド", "100スレッド", "200スレッド", "300スレッド"],
      values: [561, 566, 482, 475]
    },
    {
      name: "DDoSあり（TPS）",
      labels: ["50スレッド", "100スレッド", "200スレッド", "300スレッド"],
      values: [247, 252, 250, 252]
    }
  ], {
    x: 5.15, y: 1.33, w: 4.5, h: 3.1,
    barDir: "col",
    chartColors: [C.teal, C.accent],
    chartArea: { fill: { color: C.white }, roundedCorners: true },
    catAxisLabelColor: C.gray,
    valAxisLabelColor: C.gray,
    valGridLine: { color: C.lightGray, size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelPosition: "outEnd",
    dataLabelColor: C.dark,
    dataLabelFontSize: 9,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 10,
  });

  // Key finding
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.35, y: 4.5, w: 9.3, h: 0.85,
    fill: { color: C.tealLight },
    line: { color: C.teal },
    rectRadius: 0.07
  });
  slide.addText("💡 DDoS防御の有無による性能差は小さく（約2TPS差／ウォレット作成、約220TPS差／残高照会）、高い処理性能を維持", {
    x: 0.5, y: 4.5, w: 9.0, h: 0.85,
    fontSize: 12, color: C.navy, bold: true, valign: "middle", align: "left"
  });
}

// ─────────────────────────────────────────────────────────────────────
// Slide 7: まとめ
// ─────────────────────────────────────────────────────────────────────
{
  const slide = pres.addSlide();
  slide.background = { color: C.navy };

  // Decorative shapes
  slide.addShape(pres.shapes.OVAL, {
    x: 7.0, y: 3.5, w: 4.0, h: 4.0,
    fill: { color: C.teal, transparency: 80 },
    line: { color: C.teal, transparency: 80 }
  });

  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 10, h: 0.85,
    fill: { color: C.navyLight }, line: { color: C.navyLight }
  });
  slide.addText("まとめ", {
    x: 0.5, y: 0, w: 8.5, h: 0.85,
    fontSize: 28, color: C.white, bold: true, valign: "middle"
  });
  slide.addText("7 / 7", {
    x: 8.8, y: 0.05, w: 1.0, h: 0.75,
    fontSize: 10, color: "A0B0CC", align: "right", valign: "middle"
  });

  const points = [
    ["✅ 達成", "秘密鍵のサーバー管理でデバイス依存リスクを解消"],
    ["✅ 達成", "ガス自動チャージでユーザーの技術的負担をゼロに"],
    ["✅ 達成", "トランザクションIDによる取引完全性・否認防止を実現"],
    ["✅ 達成", "DDoS防御・海外IPブロックでサーバーを保護"],
    ["✅ 達成", "Flutter製WebアプリでPC・スマホ共通UI提供"],
  ];

  points.forEach((p, i) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.4, y: 1.05 + i * 0.81, w: 9.2, h: 0.72,
      fill: { color: "FFFFFF", transparency: 90 },
      line: { color: "FFFFFF", transparency: 70 },
      rectRadius: 0.06
    });
    slide.addText(p[0], {
      x: 0.55, y: 1.05 + i * 0.81, w: 1.3, h: 0.72,
      fontSize: 12, color: C.accent, bold: true, valign: "middle"
    });
    slide.addText(p[1], {
      x: 1.9, y: 1.05 + i * 0.81, w: 7.5, h: 0.72,
      fontSize: 13, color: C.white, valign: "middle"
    });
  });

  // Future work
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.4, y: 5.1, w: 9.2, h: 0.4,
    fill: { color: C.teal, transparency: 30 },
    line: { color: C.teal },
    rectRadius: 0.05
  });
  slide.addText("🔮 今後の展望：IoT自動定期払い、少額ローン、24時間決済サービスへの応用が期待される", {
    x: 0.5, y: 5.1, w: 9.0, h: 0.4,
    fontSize: 11, color: C.white, valign: "middle", align: "left"
  });
}

// Save
pres.writeFile({ fileName: "blockchain_p2p_ja.pptx" })
  .then(() => console.log("Done: blockchain_p2p_ja.pptx"))
  .catch(console.error);