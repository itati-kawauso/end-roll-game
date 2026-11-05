/**
 * Comprehensive Japanese Film End Credits database & enriched anomaly generator.
 */

export interface CreditItem {
  id: string;
  role: string;
  name: string;
  isHeader?: boolean;
  isStudioLogo?: boolean;
  isAnomaly?: boolean;
  anomalyType?:
    | 'mojibake'
    | 'long_name'
    | 'absurd_role'
    | 'flipped'
    | 'mirrored'
    | 'ghost'
    | 'shaking'
    | 'rainbow'
    | 'giant'
    | 'tiny'
    | 'swapped';
  anomalyHint?: string;
  wasFound?: boolean; // For mode 3 detection
}

export const MOVIE_TITLES = [
  "黄昏のシネマパラダイス",
  "東京ラストプロジェクション",
  "夜明けのフィルムリール",
  "銀幕の向こう側の記憶",
  "エンドロールが止まらない日",
  "星屑のフィルムアーカイブ",
  "サバイバル・イン・ザ・シアター",
];

export const STANDARD_ROLES = [
  "監督",
  "助監督",
  "監督補",
  "脚本",
  "原作",
  "エグゼクティブプロデューサー",
  "プロデューサー",
  "アソシエイトプロデューサー",
  "撮影監督",
  "撮影助手",
  "ステディカムオペレーター",
  "ドローンパイロット",
  "照明",
  "照明助手",
  "録音",
  "録音助手",
  "音響効果",
  "整音",
  "フォーリーアーティスト",
  "美術監督",
  "美術デザイナー",
  "装飾",
  "小道具",
  "持道具",
  "衣装デザイン",
  "衣装",
  "ヘアメイク",
  "特殊メイク",
  "特殊造形",
  "編集",
  "編集助手",
  "カラーグレーディング",
  "カラリスト",
  "VFXスーパーバイザー",
  "CGディレクター",
  "3Dモデラー",
  "コンポジター",
  "マットペインター",
  "アクション監督",
  "スタントコーディネーター",
  "スタントマン",
  "ワイヤーアクション",
  "操演・特殊効果",
  "音楽",
  "劇伴作曲",
  "指揮",
  "オーケストラ演奏",
  "主題歌",
  "劇中歌",
  "キャスティングディレクター",
  "方言指導",
  "時代考証",
  "警察監修",
  "医療監修",
  "殺陣指導",
  "制作担当",
  "制作進行",
  "ロケーション統括",
  "ロケ地コーディネーター",
  "車両担当",
  "ケータリング",
  "スチール撮影",
  "メイキングディレクター",
  "宣伝プロデューサー",
  "パブリシティ",
  "予告編ディレクター",
  "グラフィックデザイン",
  "タイポグラフィ",
  "字幕翻訳",
  "配給統括",
  "劇場営業",
  "Special Thanks",
];

export const SURNAMES = [
  "佐藤", "鈴木", "高橋", "田中", "渡辺", "伊藤", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "斉藤", "松本", "井上", "木村", "林", "清水",
  "山崎", "森", "池田", "橋本", "阿部", "石川", "山内", "小川", "前田", "岡田",
  "長谷川", "藤井", "後藤", "近藤", "村上", "遠藤", "青木", "坂本", "福田", "西村",
  "三浦", "藤田", "中川", "岡本", "松田", "原田", "中野", "小野", "田村", "竹内",
  "金子", "和田", "中山", "石井", "上田", "森田", "原", "柴田", "酒井", "工藤",
  "横山", "宮崎", "宮本", "内田", "高木", "安藤", "島田", "谷口", "大野", "高田"
];

export const GIVEN_NAMES = [
  "健一", "拓也", "翔太", "達也", "大樹", "誠", "俊介", "浩司", "雄大", "慎太郎",
  "悠真", "陸", "蓮", "颯太", "陽向", "健太", "翼", "亮平", "竜也", "一樹",
  "剛", "圭介", "康平", "雅人", "哲也", "智也", "智樹", "晃", "直樹", "秀樹",
  "洋平", "駿", "隼人", "裕太", "涼介",
  "結衣", "陽菜", "葵", "さくら", "美咲", "遥", "凛", "美穂", "七海", "奈緒",
  "茜", "彩香", "真由", "萌", "千夏", "綾乃", "瞳", "詩織", "優子", "明日香",
  "香織", "恵美", "麻美", "裕美", "愛美", "友梨", "瑞希", "莉子", "芽依", "琴音"
];

export const ANOMALIES_POOL: Array<{
  role: string;
  name: string;
  anomalyType:
    | 'mojibake'
    | 'long_name'
    | 'absurd_role'
    | 'flipped'
    | 'mirrored'
    | 'ghost'
    | 'shaking'
    | 'rainbow'
    | 'giant'
    | 'tiny'
    | 'swapped';
  anomalyHint: string;
}> = [
  // --- 1. サスペンス・SF・怪奇・メタフィクション系 ---
  {
    role: "真の黒幕",
    name: "佐藤 健一",
    anomalyType: "absurd_role",
    anomalyHint: "スタッフロールで物語の「真の黒幕」がネタバレされている！",
  },
  {
    role: "エイリアン通訳",
    name: "田中 太郎",
    anomalyType: "absurd_role",
    anomalyHint: "地球外生命体（宇宙人）の通訳が混ざっている！",
  },
  {
    role: "時空警察（潜入捜査中）",
    name: "高橋 涼介",
    anomalyType: "absurd_role",
    anomalyHint: "時空警察がエンドロールに潜入捜査している！",
  },
  {
    role: "異世界転生担当",
    name: "伊藤 隼人",
    anomalyType: "absurd_role",
    anomalyHint: "現代映画なのに異世界転生の手続き窓口がある！",
  },
  {
    role: "幽霊役（本物の心霊）",
    name: "名無しの権兵衛",
    anomalyType: "absurd_role",
    anomalyHint: "役者ではなく本物の心霊がクレジットされている！",
  },
  {
    role: "あなたの背後に立つ者",
    name: "・・・・・・",
    anomalyType: "absurd_role",
    anomalyHint: "映画館のあなたの真後ろに誰かが立っている……！？",
  },
  {
    role: "第四の壁修復工事",
    name: "株式会社メタフィクション",
    anomalyType: "absurd_role",
    anomalyHint: "観客に話しかけすぎて壊れた「第四の壁」を修理している！",
  },
  {
    role: "AI生成の証拠隠滅係",
    name: "山田 誠",
    anomalyType: "absurd_role",
    anomalyHint: "脚本をAIに書かせた痕跡を急いで消去している！",
  },
  {
    role: "エンドロール早送り阻止係",
    name: "加藤 剛",
    anomalyType: "absurd_role",
    anomalyHint: "観客がリモコンで早送りするのを必死に阻止している！",
  },

  // --- 2. 映画館マナー違反・客席怪現象系 ---
  {
    role: "座席背もたれキック犯",
    name: "鈴木 翔太",
    anomalyType: "absurd_role",
    anomalyHint: "前の席の背もたれを執拗に蹴っていた犯人だ！",
  },
  {
    role: "暗闇でのスマホ画面全開鑑賞",
    name: "田中 健児",
    anomalyType: "absurd_role",
    anomalyHint: "劇場の暗闇でスマホの最大輝度を放つ光害犯がいる！",
  },
  {
    role: "ポップコーン咀嚼音（爆音）",
    name: "ガリガリボリボリ",
    anomalyType: "absurd_role",
    anomalyHint: "静かな感動シーンで爆音ポップコーンを咀嚼していた！",
  },
  {
    role: "上映中の盛大な着信音",
    name: "ピロリロリン♪",
    anomalyType: "absurd_role",
    anomalyHint: "クライマックスでマナーモードを忘れた着信音が鳴っている！",
  },
  {
    role: "ポップコーン泥棒",
    name: "渡辺 拓海",
    anomalyType: "absurd_role",
    anomalyHint: "隣の席のポップコーンをつまみ食いした窃盗犯がいる！",
  },

  // --- 3. 撮影現場の事故・やらかし系 ---
  {
    role: "ロケ弁つまみ食い係",
    name: "渡辺 拓海",
    anomalyType: "absurd_role",
    anomalyHint: "ロケ弁の唐揚げをつまみ食いした容疑者が自首している！",
  },
  {
    role: "爆破ボタン誤射担当",
    name: "山本 浩司",
    anomalyType: "absurd_role",
    anomalyHint: "撮影中に爆破ボタンを誤射してセットを吹き飛ばした！",
  },
  {
    role: "国宝級の美術壺を粉砕",
    name: "清水 達也",
    anomalyType: "absurd_role",
    anomalyHint: "小道具の高価な壺を豪快に割った犯人が白状している！",
  },
  {
    role: "マイクが画面に見切れた録音助手",
    name: "山本 浩司",
    anomalyType: "absurd_role",
    anomalyHint: "画面の上からガンマイクが見切れて映り込んでいた！",
  },
  {
    role: "カンペ丸読み俳優",
    name: "中村 達也",
    anomalyType: "absurd_role",
    anomalyHint: "台詞を一切暗記せずカンペだけを凝視していた俳優がいる！",
  },
  {
    role: "NGテイク100回達成記念",
    name: "小林 大樹",
    anomalyType: "absurd_role",
    anomalyHint: "同じシーンで100回NGを出して現場を凍りつかせた！",
  },
  {
    role: "徹夜続きで幻覚が見える編集",
    name: "木村 駿",
    anomalyType: "absurd_role",
    anomalyHint: "納品直前で幻覚を見ながら編集したスタッフがいる！",
  },

  // --- 4. 超長名・文字化け系 ---
  {
    role: "衣装担当",
    name: "寿限無寿限無五劫の擦り切れ海砂利水魚の水行末雲来末風来末食う寝る処に住む処やぶら小路の藪柑子パイポパイポパイポのシューリンガンシューリンガンのグーリンダイ",
    anomalyType: "long_name",
    anomalyHint: "名前が画面外へ突き抜けるほど異常に長い！",
  },
  {
    role: "音響効果",
    name: "§¶€¥#@?!_文字化け発生",
    anomalyType: "mojibake",
    anomalyHint: "名前が完全に文字化けして破損している！",
  },
  {
    role: "■■■■■■",
    name: "機密指定 [REDACTED]",
    anomalyType: "mojibake",
    anomalyHint: "役職が黒塗りで機密指定として墨消しされている！",
  },
  {
    role: "助監督",
    name: "01001000 01000101 01001100 01010000",
    anomalyType: "mojibake",
    anomalyHint: "名前が「HELP」を表す謎の2進数バイナリコードになっている！",
  },

  // --- 5. 視覚ギミック（上下反転・鏡文字・激震・ゲーミング・巨大・極小・役職逆転） ---
  {
    role: "撮影監督",
    name: "松本 亮平",
    anomalyType: "flipped",
    anomalyHint: "文字が180度上下逆さま（反転）になっている！",
  },
  {
    role: "照明技師",
    name: "斉藤 悠真",
    anomalyType: "mirrored",
    anomalyHint: "文字が左右反転した鏡文字になっている！",
  },
  {
    role: "美術監督",
    name: "井上 結衣",
    anomalyType: "ghost",
    anomalyHint: "名前が赤青のRGB色収差で怪しく点滅している！",
  },
  {
    role: "スタント統括",
    name: "岡田 剛",
    anomalyType: "shaking",
    anomalyHint: "文字が恐怖でガタガタと激しく震えている！",
  },
  {
    role: "劇伴音楽",
    name: "七色 ゲーミングサウンド",
    anomalyType: "rainbow",
    anomalyHint: "映画なのに文字がゲーミングPCのように虹色に発光している！",
  },
  {
    role: "超巨大文字",
    name: "巨大 圧迫太郎",
    anomalyType: "giant",
    anomalyHint: "フォントサイズが異常に巨大で画面を圧迫している！",
  },
  {
    role: "超微小文字",
    name: "読めない米粒氏",
    anomalyType: "tiny",
    anomalyHint: "文字が米粒のように極小サイズに縮んでいる！",
  },
  {
    role: "佐藤 健一",
    name: "【 監 督 】",
    anomalyType: "swapped",
    anomalyHint: "役職の欄に名前が、名前の欄に役職が入って逆転している！",
  },
];

let globalCounter = 0;

export function getRandomName(): string {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const given = GIVEN_NAMES[Math.floor(Math.random() * GIVEN_NAMES.length)];
  return `${surname} ${given}`;
}

export function getRandomRole(): string {
  return STANDARD_ROLES[Math.floor(Math.random() * STANDARD_ROLES.length)];
}

export function createCreditItem(forceAnomaly?: boolean): CreditItem {
  globalCounter++;
  const id = `credit-${Date.now()}-${globalCounter}`;

  if (forceAnomaly) {
    const anomaly = ANOMALIES_POOL[Math.floor(Math.random() * ANOMALIES_POOL.length)];
    return {
      id,
      role: anomaly.role,
      name: anomaly.name,
      isAnomaly: true,
      anomalyType: anomaly.anomalyType,
      anomalyHint: anomaly.anomalyHint,
      wasFound: false,
    };
  }

  // 1 in 14 is section header
  if (globalCounter % 14 === 0) {
    const headers = [
      "【 撮 影 部 】",
      "【 照 明 部 】",
      "【 録 音 部 】",
      "【 美 術 部 】",
      "【 Ｃ Ｇ ・ Ｖ Ｆ Ｘ 部 】",
      "【 ア ク シ ョ ン ・ ス タ ン ト 】",
      "【 音 楽 ・ 劇 伴 】",
      "【 製 作 委 員 会 】",
    ];
    return {
      id,
      role: "",
      name: headers[Math.floor(Math.random() * headers.length)],
      isHeader: true,
    };
  }

  return {
    id,
    role: getRandomRole(),
    name: getRandomName(),
    isAnomaly: false,
  };
}

export function generateInitialCreditsBatch(count: number, withAnomalies: boolean = false): CreditItem[] {
  const items: CreditItem[] = [];
  for (let i = 0; i < count; i++) {
    const shouldBeAnomaly = withAnomalies && (i > 2) && (i % 6 === 0 || Math.random() < 0.22);
    items.push(createCreditItem(shouldBeAnomaly));
  }
  return items;
}
