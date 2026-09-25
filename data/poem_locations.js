// ============================================================
// 詩詞地點資料模組（詩路地圖 用）
// ------------------------------------------------------------
// 收錄 data/poems.js 中 rating >= 6 的詩詞（共 63 首）裡，
// 有足夠考據把握標點的 52 首、62 個地點。
//
// 欄位說明：
//   place      -- 詩中/傳統箋注所指的古地名
//   modern     -- 現代行政區對應地名（給玩家看的「這裡就是現在的哪裡」）
//   lat / lng  -- WGS-84 概略經緯度（城市級精度，非測繪級）
//   relation   -- scene=詩中實景 / hometown=故鄉延伸 / exile=貶謫地 / destination=送別對象目的地
//   certainty  -- exact=詩題或詩句明寫地名
//                 approx=傳統箋注認定但非詩中明寫
//                 symbolic=詩詞課本式的情感延伸連結，非史學定論（UI 需與 exact/approx 明顯區分）
//                 disputed=史學界多地互爭、無定論（此處僅取最普遍認定的一說）
//   note       -- 一句話考據依據，供地圖彈窗顯示，避免把推論講成定論
//
// 未收錄的 11 首詩（〈錦瑟〉、〈無題〉x2、〈相思〉、〈尋隱者不遇〉、〈憫農詩-其二〉、
// 〈山行〉、〈村居〉、〈花非花〉、〈天淨沙-秋思〉）因缺乏可靠地理線索，經與企劃討論後
// 決定不勉強標點，寧可誠實地少幾個點。完整考據過程見：
// note/詩路地圖_地點候選清單與底圖校準.md
//
// key 為 data/poems.js 中的 id，與 data/poem_story.js 的慣例一致。
// ============================================================

const POEM_LOCATIONS = {
  3: { // 短歌行 / 曹操
    locs: [
      { place: '赤壁', modern: '湖北省赤壁市', lat: 29.72, lng: 113.8, relation: 'scene', certainty: 'approx', note: '傳統認為作於赤壁之戰前夕，確切地點史學界另有蒲圻/黃州等爭議' },
    ]
  },
  6: { // 飲酒-其五 / 陶淵明
    locs: [
      { place: '潯陽柴桑（廬山）', modern: '江西省九江市', lat: 29.71, lng: 115.98, relation: 'scene', certainty: 'approx', note: '陶淵明歸隱故居，"悠然見南山"之南山即廬山' },
    ]
  },
  11: { // 下終南山過斛斯山人宿置酒 / 李白
    locs: [
      { place: '終南山', modern: '陝西省西安市', lat: 34.05, lng: 108.7, relation: 'scene', certainty: 'exact', note: '詩題明寫終南山，李白供奉翰林期間游賞之作' },
    ]
  },
  12: { // 月下獨酌 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '一般箋注繫於天寶年間供奉翰林、失意於長安時期' },
    ]
  },
  17: { // 子夜四時歌(秋歌) / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '詩句明寫"長安一片月，萬戶擣衣聲"' },
    ]
  },
  53: { // 遊子吟 / 孟郊
    locs: [
      { place: '溧陽', modern: '江蘇省溧陽市', lat: 31.43, lng: 119.48, relation: 'scene', certainty: 'exact', note: '詩題下自注「迎母溧上作」，孟郊時任溧陽尉' },
      { place: '武康', modern: '浙江省湖州市德清縣', lat: 30.54, lng: 119.97, relation: 'hometown', certainty: 'approx', note: '孟郊籍貫湖州武康，其母自此處被接來溧陽同住' },
    ]
  },
  55: { // 登幽州臺歌 / 陳子昂
    locs: [
      { place: '幽州臺（薊北樓）', modern: '北京市', lat: 39.9, lng: 116.4, relation: 'scene', certainty: 'exact', note: '詩題明寫幽州台，隨武攸宜北征契丹時所作' },
    ]
  },
  60: { // 宣州謝朓樓餞別校書叔雲 / 李白
    locs: [
      { place: '謝朓樓', modern: '安徽省宣城市', lat: 30.95, lng: 118.76, relation: 'scene', certainty: 'exact', note: '詩題明寫宣州謝朓樓' },
    ]
  },
  69: { // 將進酒 / 李白
    locs: [
      { place: '嵩山穎陽（元丹丘山居）', modern: '河南省登封市', lat: 34.45, lng: 113.05, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於與岑勳、元丹丘會飲於嵩山穎陽山居' },
    ]
  },
  90: { // 白雪歌送武判官歸京 / 岑參
    locs: [
      { place: '輪台（北庭）', modern: '新疆維吾爾自治區', lat: 43.9, lng: 87.6, relation: 'scene', certainty: 'approx', note: '岑參任職北庭都護府期間所作，唐代輪台位置與今輪台縣略有出入' },
    ]
  },
  101: { // 長恨歌 / 白居易
    locs: [
      { place: '仙遊寺', modern: '陝西省西安市周至縣', lat: 34.13, lng: 107.98, relation: 'scene', certainty: 'approx', note: '白居易任盩厔縣尉時與友人遊仙遊寺有感而作' },
      { place: '馬嵬坡', modern: '陝西省咸陽市興平市', lat: 34.3, lng: 108.44, relation: 'scene', certainty: 'exact', note: '詩中楊貴妃殞命之地，詩句明寫' },
    ]
  },
  102: { // 琵琶行并序 / 白居易
    locs: [
      { place: '潯陽江頭', modern: '江西省九江市', lat: 29.71, lng: 115.98, relation: 'scene', certainty: 'exact', note: '序文明寫「潯陽江頭夜送客」，白居易貶江州司馬時期' },
    ]
  },
  105: { // 送杜少府之任蜀州 / 王勃
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '送別地點，王勃在長安任職期間所作' },
      { place: '蜀州', modern: '四川省成都市崇州市', lat: 30.63, lng: 103.67, relation: 'destination', certainty: 'exact', note: '杜少府即將赴任之地，詩題明寫' },
    ]
  },
  116: { // 春望 / 杜甫
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '安史之亂中，杜甫身陷淪陷的長安城所作' },
    ]
  },
  119: { // 月夜憶舍弟 / 杜甫
    locs: [
      { place: '秦州', modern: '甘肅省天水市', lat: 34.58, lng: 105.72, relation: 'scene', certainty: 'exact', note: '杜甫759年棄官流寓秦州時所作' },
    ]
  },
  123: { // 旅夜書懷 / 杜甫
    locs: [
      { place: '渝州至忠州舟中', modern: '重慶市', lat: 29.56, lng: 106.55, relation: 'scene', certainty: 'approx', note: '嚴武病逝後杜甫離蜀東下途中，舟泊長江一帶所作' },
    ]
  },
  134: { // 終南別業 / 王維
    locs: [
      { place: '輞川別業', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'exact', note: '王維中年後半官半隱的輞川別業所在' },
    ]
  },
  145: { // 賦得古原草送別 / 白居易
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '相傳白居易十五六歲赴長安應舉、以此詩謁見顧況之作' },
    ]
  },
  192: { // 蜀相 / 杜甫
    locs: [
      { place: '武侯祠', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'exact', note: '杜甫寓居成都期間拜謁武侯祠所作' },
    ]
  },
  195: { // 聞官軍收河南河北 / 杜甫
    locs: [
      { place: '梓州', modern: '四川省綿陽市三台縣', lat: 31.09, lng: 105.1, relation: 'scene', certainty: 'exact', note: '杜甫寓居梓州時聽聞安史之亂平定的消息' },
    ]
  },
  209: { // 黃鶴樓 / 崔顥
    locs: [
      { place: '黃鶴樓', modern: '湖北省武漢市', lat: 30.54, lng: 114.3, relation: 'scene', certainty: 'exact', note: '詩題明寫黃鶴樓，李白登樓見此詩而擱筆的典故發生地' },
    ]
  },
  252: { // 遊山西村 / 陸游
    locs: [
      { place: '山陰（鑑湖附近山村）', modern: '浙江省紹興市', lat: 30, lng: 120.58, relation: 'scene', certainty: 'approx', note: '陸游罷官還鄉、閒居山陰時所作' },
    ]
  },
  253: { // 過零丁洋 / 文天祥
    locs: [
      { place: '零丁洋（伶仃洋）', modern: '廣東省珠海市/中山市外海', lat: 21.0, lng: 114.5, relation: 'scene', certainty: 'exact', note: '詩題明寫零丁洋，文天祥被俘後押解北上經此海域所作' },
    ]
  },
  257: { // 靜夜思 / 李白
    locs: [
      { place: '揚州客舍', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'approx', note: '學界多認為26歲的李白客居揚州時所作' },
      { place: '綿州（故鄉）', modern: '四川省江油市', lat: 31.78, lng: 104.75, relation: 'hometown', certainty: 'symbolic', note: '李白25歲離鄉後終生未歸，此為詩中「故鄉」的實指延伸' },
    ]
  },
  263: { // 鹿柴 / 王維
    locs: [
      { place: '輞川別業·鹿柴', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'exact', note: '輞川二十景之一，王維隱居輞川時所作組詩' },
    ]
  },
  267: { // 雜詩 / 王維
    locs: [
      { place: '蒲州（故鄉）', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, relation: 'hometown', certainty: 'symbolic', note: '詩中「故鄉」所指，王維本籍河東蒲州，寫作地點本身未明' },
    ]
  },
  270: { // 春曉 / 孟浩然
    locs: [
      { place: '鹿門山', modern: '湖北省襄陽市', lat: 32.02, lng: 112.17, relation: 'scene', certainty: 'approx', note: '傳統認為孟浩然歸隱鹿門山時期所作' },
    ]
  },
  273: { // 登鸛雀樓 / 王之渙
    locs: [
      { place: '鸛雀樓', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, relation: 'scene', certainty: 'exact', note: '詩題明寫鸛雀樓，位於蒲州古城西南' },
    ]
  },
  277: { // 江雪 / 柳宗元
    locs: [
      { place: '永州', modern: '湖南省永州市', lat: 26.22, lng: 111.61, relation: 'exile', certainty: 'exact', note: '柳宗元貶謫永州司馬十年間代表作' },
    ]
  },
  297: { // 登樂遊原 / 李商隱
    locs: [
      { place: '樂遊原', modern: '陝西省西安市', lat: 34.24, lng: 108.97, relation: 'scene', certainty: 'exact', note: '詩題明寫樂遊原，位於長安城南高地' },
    ]
  },
  303: { // 送孟浩然之廣陵 / 李白
    locs: [
      { place: '黃鶴樓', modern: '湖北省武漢市', lat: 30.54, lng: 114.3, relation: 'scene', certainty: 'exact', note: '詩句明寫「故人西辭黃鶴樓」，送別地點' },
      { place: '廣陵', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'destination', certainty: 'exact', note: '孟浩然此行目的地，詩題明寫' },
    ]
  },
  304: { // 下江陵(早發白帝城) / 李白
    locs: [
      { place: '白帝城', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'scene', certainty: 'exact', note: '詩句明寫「朝辭白帝彩雲間」，李白流放夜郎途中遇赦的起點' },
      { place: '江陵', modern: '湖北省荊州市', lat: 30.35, lng: 112.19, relation: 'destination', certainty: 'exact', note: '詩題「下江陵」的終點，三峽順流而下所抵之地' },
    ]
  },
  310: { // 望廬山瀑布 / 李白
    locs: [
      { place: '廬山', modern: '江西省九江市', lat: 29.55, lng: 115.98, relation: 'scene', certainty: 'exact', note: '詩題明寫廬山瀑布' },
    ]
  },
  319: { // 九月九日憶山東兄弟 / 王維
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '17歲的王維隻身在長安應舉時所作' },
      { place: '蒲州（山東兄弟所在故鄉）', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, relation: 'hometown', certainty: 'symbolic', note: '題中「山東」指崤山以東的蒲州老家，非今山東省' },
    ]
  },
  328: { // 涼州詞 / 王翰
    locs: [
      { place: '涼州', modern: '甘肅省武威市', lat: 37.93, lng: 102.64, relation: 'scene', certainty: 'exact', note: '詩題明寫涼州，唐代西北邊塞軍鎮' },
    ]
  },
  329: { // 回鄉偶書 / 賀知章
    locs: [
      { place: '會稽（故鄉）', modern: '浙江省紹興市', lat: 30, lng: 120.58, relation: 'hometown', certainty: 'exact', note: '賀知章86歲告老還鄉，回到闊別50餘年的會稽故里' },
    ]
  },
  332: { // 別董大-其一 / 高適
    locs: [
      { place: '睢陽', modern: '河南省商丘市', lat: 34.41, lng: 115.65, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於高適早年困頓宋州（睢陽）時期' },
    ]
  },
  333: { // 大林寺桃花 / 白居易
    locs: [
      { place: '大林寺', modern: '江西省九江市廬山', lat: 29.55, lng: 115.98, relation: 'scene', certainty: 'exact', note: '詩題明寫大林寺，位於廬山香爐峰頂' },
    ]
  },
  343: { // 楓橋夜泊 / 張繼
    locs: [
      { place: '楓橋·寒山寺', modern: '江蘇省蘇州市', lat: 31.32, lng: 120.58, relation: 'scene', certainty: 'exact', note: '詩題明寫楓橋，寒山寺即在楓橋畔' },
    ]
  },
  350: { // 離思其四 / 元稹
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '元稹悼念亡妻韋叢之作，寫作地點未明確記載' },
    ]
  },
  359: { // 夜雨寄北 / 李商隱
    locs: [
      { place: '梓州（巴山）', modern: '四川省綿陽市三台縣', lat: 31.09, lng: 105.1, relation: 'scene', certainty: 'approx', note: '李商隱入東川節度使柳仲郢幕府期間所作' },
      { place: '長安（寄望對象）', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'destination', certainty: 'approx', note: '詩題「寄北」的對象所在地' },
    ]
  },
  368: { // 泊秦淮 / 杜牧
    locs: [
      { place: '秦淮河', modern: '江蘇省南京市', lat: 32.03, lng: 118.79, relation: 'scene', certainty: 'exact', note: '詩題明寫泊秦淮，南京秦淮河畔' },
    ]
  },
  377: { // 清明 / 杜牧
    locs: [
      { place: '杏花村', modern: '安徽省池州市', lat: 30.66, lng: 117.49, relation: 'scene', certainty: 'disputed', note: '杜牧任池州刺史時期作品，惟「杏花村」今有安徽池州、山西汾陽等多地互爭，此處取池州一說' },
    ]
  },
  395: { // 金縷衣 / 杜秋娘
    locs: [
      { place: '金陵（出身地）', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'symbolic', note: '杜秋娘出身金陵歌妓，寫作場合與地點未有定論' },
    ]
  },
  397: { // 題西林壁 / 蘇軾
    locs: [
      { place: '西林寺', modern: '江西省九江市廬山', lat: 29.55, lng: 115.98, relation: 'scene', certainty: 'exact', note: '詩題明寫西林壁，蘇軾結束黃州貶謫後遊廬山所作' },
    ]
  },
  416: { // 滕王閣序 / 王勃
    locs: [
      { place: '滕王閣', modern: '江西省南昌市', lat: 28.68, lng: 115.88, relation: 'scene', certainty: 'exact', note: '詩題明寫滕王閣，王勃探父途經南昌即席而作' },
    ]
  },
  430: { // 虞美人-春花秋月何時了 / 李煜
    locs: [
      { place: '汴京（被俘囚所）', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '李煜亡國後被囚汴京時所作，史載因此詞觸怒宋太宗而被賜毒酒' },
      { place: '金陵（故國）', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '詞中「故國不堪回首」所指的南唐故都' },
    ]
  },
  436: { // 水調歌頭-丙辰中秋 / 蘇軾
    locs: [
      { place: '密州', modern: '山東省濰坊市諸城市', lat: 35.99, lng: 119.41, relation: 'scene', certainty: 'exact', note: '詞序明寫「丙辰中秋歡飲達旦，兼懷子由」，蘇軾任密州知州時所作' },
    ]
  },
  440: { // 定風波 / 蘇軾
    locs: [
      { place: '沙湖道中', modern: '湖北省黃岡市', lat: 30.45, lng: 114.87, relation: 'exile', certainty: 'exact', note: '詞序明寫「沙湖道中遇雨」，蘇軾黃州貶謫時期作品' },
    ]
  },
  447: { // 如夢令-昨夜雨疏風驟 / 李清照
    locs: [
      { place: '汴京（早年）', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'approx', note: '李清照早年在汴京生活時期的少女詞作，具體地點無確切記載' },
    ]
  },
  456: { // 青玉案-元夕 / 辛棄疾
    locs: [
      { place: '臨安', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'approx', note: '南宋都城臨安元宵燈會盛景，辛棄疾以此寄託身為北人的孤寂' },
    ]
  },
  457: { // 醜奴兒-書博山道中壁 / 辛棄疾
    locs: [
      { place: '博山', modern: '江西省上饒市鉛山縣', lat: 28.02, lng: 117.71, relation: 'scene', certainty: 'exact', note: '詞題明寫博山道中，辛棄疾閒居帶湖時期常遊之地' },
    ]
  },
  464: { // 臨江仙-滾滾長江東逝水 / 楊慎
    locs: [
      { place: '永昌衛', modern: '雲南省保山市', lat: 25.11, lng: 99.16, relation: 'exile', certainty: 'approx', note: '楊慎晚年謫戍雲南永昌衛，於江邊漁樵間寫下此詞，即遊子吟故事所本' },
    ]
  },
};

// 若在 Node.js 環境，匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = POEM_LOCATIONS;
}
