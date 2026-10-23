/* ============================================================
   サイト設定
   当日に変えたくなる値はすべてここに集めてある。
   index.html / share.html の両方がこのファイルを読む。
============================================================ */
window.SITE = {

  /* ---------- 出し物の基本情報 ---------- */
  name:     "縁ノ神託所",        // 出し物名（仮）
  kana:     "えんのしんたくじょ",
  tagline:  "運命、賄賂で買いませんか？",
  className: "2年C組",
  event:    "収穫祭 2026",
  date:     "日時は決まり次第掲載します",   // 例: "11月2日(土)・3日(日) 10:00〜16:00"
  place:    "2年C組 教室",

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
      role: "保険",
      text: "投げれば、まず増える。手持ちが心細くなったらここへ。",
      enabled: true,
    },
    {
      id: "shinkei",
      name: "神経衰弱",
      kana: "しんけいすいじゃく",
      time: "2〜3分",
      fee: "50縁",
      payout: "0〜200縁",
      role: "技術",
      text: "覚えた者だけが稼ぐ。運より記憶。もっとも堅実な道。",
      enabled: true,
    },
    {
      id: "tsumi",
      name: "積み",
      kana: "つみ",
      time: "3〜5分",
      fee: "100縁",
      payout: "積んだ段数 × 50縁",
      role: "団体",
      text: "仲間と囲んで、崩れるまで積む。一段ごとに縁が増え、観客が息を呑む。",
      featured: true,
      enabled: true,
    },
    {
      id: "chinchiro",
      name: "チンチロ",
      kana: "ちんちろ",
      time: "20秒",
      fee: "張る縁は自由",
      payout: "0〜5倍",
      role: "一攫千金",
      text: "賽を三つ、椀に落とす。番付の上位は、だいたいここから生まれる。",
      featured: true,
      enabled: true,
    },
  ],

  /* ---------- 心付けの位 ----------
     min は下限。改竄の下限は kaizanThreshold を使う。 */
  ranks: [
    { id: "mu",     name: "無",   min: 0,    attitude: "事実だけを告げて、終わる。" },
    { id: "sho",    name: "小",   min: 100,  attitude: "誠実に占い、助言まで丁寧に。" },
    { id: "dai",    name: "大",   min: 500,  attitude: "占い師が媚びる。悪い兆は、すべて他人のせい。" },
    { id: "kaizan", name: "改竄", min: null, attitude: "神託そのものを、書き換える。" },
  ],

  /* ---------- データの置き場所 ----------
     空文字なら data/*.json を読む。
     Googleスプレッドシートを「ウェブに公開 → CSV」にしたURLを入れると、
     書記がシートに入力した内容がそのまま反映される（詳細は README）。 */
  rankingCsvUrl: "",
  resultsCsvUrl: "",
};

/* 心付け額から位を返す（index / share 共通） */
window.rankOf = function (amount) {
  var s = window.SITE;
  if (amount >= s.kaizanThreshold) return s.ranks[3];
  for (var i = 2; i >= 0; i--) {
    if (amount >= s.ranks[i].min) return s.ranks[i];
  }
  return s.ranks[0];
};

/* 最小限のCSVパーサ（ダブルクォート対応） */
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
