/* ============================================================
   サイト設定
   当日に変えたくなる値はすべてここに集めてある。
   index.html が読む。
============================================================ */
window.SITE = {

  /* ---------- 出し物の基本情報 ---------- */
  name:     "運命、賄賂で買いませんか？",   // 出し物名
  tagline:  "占いの結果は、心付け次第。",
  className: "2年C組",
  event:    "収穫祭 2026",
  date:     "日時は決まり次第掲載します",   // 例: "11月2日(土)・3日(日) 10:00〜16:00"
  place:    "2年C組 教室",
  instagram: "keioshiki2c79",              // 公式アカウント（@なし）
  credit:    "tskoizumi",                  // サイト制作者のアカウント（@なし）

  /* ---------- 改竄の閾値 ----------
     縁の増え方が想定とズレたら昼にここを変えて push する。
     ランク判定（サイト表示・シェア画像）はすべてこの値に従う。 */
  kaizanThreshold: 2000,

  /* ---------- 初期配布 ---------- */
  startingEn: 100,

  /* ---------- ミニゲーム ----------
     enabled: false にするとサイトから消える（チンチロが止められた時用）。 */
  games: [
    {
      id: "matoate",
      name: "的当て",
      kana: "まとあて",
      time: "30秒",
      fee: "10縁",
      payout: "20〜50縁",
      role: "手堅い",
      text: "投げればだいたい増える。手持ちが少なくなったらここ。",
      enabled: true,
    },
    {
      id: "shinkei",
      name: "神経衰弱",
      kana: "しんけいすいじゃく",
      time: "2〜3分",
      fee: "50縁",
      payout: "0〜200縁",
      role: "記憶力",
      text: "運ではなく記憶力。コツコツ稼ぐならこれ。",
      enabled: true,
    },
    {
      id: "tsumi",
      name: "積み",
      kana: "つみ",
      time: "3〜5分",
      fee: "100縁",
      payout: "積んだ段数 × 50縁",
      role: "みんなで",
      text: "友達と囲んで、崩れるまで積む。1段積むごとに縁が増える。",
      featured: true,
      enabled: true,
    },
    {
      id: "chinchiro",
      name: "チンチロ",
      kana: "ちんちろ",
      time: "20秒",
      fee: "賭け金は自由",
      payout: "0〜5倍",
      role: "一発逆転",
      text: "サイコロ3つで一発勝負。番付の上位は、だいたいここから生まれる。",
      featured: true,
      enabled: true,
    },
  ],

  /* ---------- 心付けの位 ----------
     min は下限。改竄の下限は kaizanThreshold を使う。 */
  ranks: [
    { id: "mu",     name: "無",   min: 0,    attitude: "事実だけ言って、終わり。" },
    { id: "sho",    name: "小",   min: 100,  attitude: "ふつうに占う。アドバイスもくれる。" },
    { id: "dai",    name: "大",   min: 500,  attitude: "とにかく褒める。悪い結果は全部、他人のせい。" },
    { id: "kaizan", name: "改竄", min: null, attitude: "占いの結果そのものを、書き換える。" },
  ],

  /* ---------- 結果・番付のシステムとの接続 ----------
     結果ページ・番付のデータは、別担当のシステムが用意する。
     resultUrl  : 「マイページ」「登録して、始める」ボタンの行き先。
                  app/ をデプロイしたら "https://app.moneytalks-uranai.com/" を入れる。
                  空のあいだは、ナビのボタンと下の案内セクションを隠す。
     rankingUrl : 番付のデータのURL。app/ なら "https://app.moneytalks-uranai.com/api/ranking"。
                  空のあいだは「開場後に更新します」のまま。 */
  resultUrl:  "",
  rankingUrl: "https://app.moneytalks-uranai.com/api/ranking",
};

/* 最小限のCSVパーサ（ダブルクォート対応）。番付をCSVで受け取るときに使う */
window.parseCsv = function (text) {
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  var head = (rows.shift() || []).map(function (h) { return h.trim(); });
  return rows
    .filter(function (r) { return r.some(function (v) { return v.trim() !== ""; }); })
    .map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = (r[j] || "").trim(); });
      return o;
    });
};
