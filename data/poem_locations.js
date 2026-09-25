// ============================================================
// 詩詞地點資料模組（詩路地圖 用）
// ------------------------------------------------------------
// 收錄 data/poems.js 中評價 3～7 的詩詞裡，有足夠考據把握標點的
// 202 首、217 個地點：
//   評價 6～7：53 首、62 個地點（第一批）
//   評價 3～5：149 首、155 個地點（第二批，見 note/詩路地圖_地點候選清單_評價3-5.md；
//              杜牧〈赤壁〉、蘇軾〈念奴嬌〉標「黃州文赤壁」，與曹操〈短歌行〉的
//              赤壁古戰場是兩個不同地點，屬文學史上有名的「兩個赤壁」）
//   ※ 評價 3～5 多了一些「借古諷今」詩（如李商隱〈隋宮〉），標的是典故發生地，
//     一律標 symbolic，地圖上以虛線空心圓與實景區分。
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
  // ===== 評價 3～5（2026-09 第二批併入，考據見 note/詩路地圖_地點候選清單_評價3-5.md）=====
  2: { // 觀滄海 / 曹操
    locs: [
      { place: '碣石山', modern: '河北省秦皇島市昌黎縣', lat: 39.69, lng: 119.15, relation: 'scene', certainty: 'exact', note: '詩句明寫「東臨碣石，以觀滄海」' },
    ]
  },
  7: { // 感遇四首之一 / 張九齡
    locs: [
      { place: '荊州', modern: '湖北省荊州市', lat: 30.35, lng: 112.19, relation: 'exile', certainty: 'approx', note: '張九齡荊州長史任內組詩' },
    ]
  },
  8: { // 感遇四首之二 / 張九齡
    locs: [
      { place: '荊州', modern: '湖北省荊州市', lat: 30.35, lng: 112.19, relation: 'exile', certainty: 'approx', note: '同組詩，荊州時期作品' },
    ]
  },
  14: { // 關山月 / 李白
    locs: [
      { place: '玉門關', modern: '甘肅省酒泉市', lat: 40.16, lng: 93.87, relation: 'scene', certainty: 'exact', note: '詩句明寫玉門關，邊塞泛寫組詩之錨點地名' },
    ]
  },
  20: { // 長干行 / 李白
    locs: [
      { place: '長干里', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫長干，金陵舊里巷名' },
    ]
  },
  22: { // 望嶽 / 杜甫
    locs: [
      { place: '泰山', modern: '山東省泰安市', lat: 36.25, lng: 117.1, relation: 'scene', certainty: 'exact', note: '詩題明寫岱宗（泰山別稱）' },
    ]
  },
  24: { // 佳人 / 杜甫
    locs: [
      { place: '秦州', modern: '甘肅省天水市', lat: 34.58, lng: 105.72, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於杜甫寓居秦州時期(759)' },
    ]
  },
  25: { // 夢李白二首之一 / 杜甫
    locs: [
      { place: '秦州', modern: '甘肅省天水市', lat: 34.58, lng: 105.72, relation: 'scene', certainty: 'approx', note: '杜甫寓居秦州、憂心流放中的李白時所作' },
    ]
  },
  26: { // 夢李白二首之二 / 杜甫
    locs: [
      { place: '秦州', modern: '甘肅省天水市', lat: 34.58, lng: 105.72, relation: 'scene', certainty: 'approx', note: '杜甫寓居秦州、憂心流放中的李白時所作' },
    ]
  },
  27: { // 送別(下馬飲君酒) / 王維
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '送友歸隱終南山，送別地點約在長安近郊' },
    ]
  },
  31: { // 西施詠 / 王維
    locs: [
      { place: '若耶溪', modern: '浙江省紹興市', lat: 29.71, lng: 120.23, relation: 'scene', certainty: 'symbolic', note: '借西施浣紗若耶溪的傳說抒懷，非王維本人行跡' },
    ]
  },
  44: { // 初發揚子寄元大校書 / 韋應物
    locs: [
      { place: '揚子津', modern: '江蘇省揚州市儀征市', lat: 32.27, lng: 119.18, relation: 'scene', certainty: 'exact', note: '詩題明寫初發揚子，長江渡口地名' },
    ]
  },
  56: { // 春江花月夜 / 張若虛
    locs: [
      { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'approx', note: '張若虛為揚州人，詩中江月傳統認為即揚州江畔' },
    ]
  },
  57: { // 廬山謠寄盧侍御虛舟 / 李白
    locs: [
      { place: '廬山', modern: '江西省九江市', lat: 29.55, lng: 115.98, relation: 'scene', certainty: 'exact', note: '詩題明寫廬山' },
    ]
  },
  58: { // 夢遊天姥吟留別 / 李白
    locs: [
      { place: '天姥山', modern: '浙江省紹興市新昌縣', lat: 29.43, lng: 120.86, relation: 'scene', certainty: 'exact', note: '詩題明寫天姥山' },
    ]
  },
  59: { // 金陵酒肆留別 / 李白
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫金陵酒肆' },
    ]
  },
  61: { // 把酒問月 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於長安時期，確切寫作時地無定論，確定性偏低' },
    ]
  },
  62: { // 南陵別兒童入京 / 李白
    locs: [
      { place: '南陵', modern: '安徽省蕪湖市南陵縣', lat: 30.9, lng: 118.33, relation: 'scene', certainty: 'exact', note: '詩題明寫南陵，李白奉詔入京前家人所在地' },
    ]
  },
  64: { // 長相思二首之一 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '詩句明寫「長相思，在長安」' },
    ]
  },
  66: { // 行路難三首之一 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於李白離開長安前後心境' },
    ]
  },
  67: { // 行路難三首之二 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '同組詩，長安時期作品' },
    ]
  },
  68: { // 行路難三首之三 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '同組詩，繫於長安時期' },
    ]
  },
  71: { // 丹青引贈曹霸將軍 / 杜甫
    locs: [
      { place: '成都', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於杜甫寓居成都期間結識畫家曹霸' },
    ]
  },
  73: { // 古柏行 / 杜甫
    locs: [
      { place: '夔州武侯廟', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於杜甫夔州時期詠武侯廟古柏' },
    ]
  },
  79: { // 洛陽女兒行 / 王維
    locs: [
      { place: '洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.42, relation: 'scene', certainty: 'exact', note: '詩題明寫洛陽' },
    ]
  },
  95: { // 八月十五夜贈張功曹 / 韓愈
    locs: [
      { place: '郴州', modern: '湖南省郴州市', lat: 25.79, lng: 113.02, relation: 'scene', certainty: 'approx', note: '韓愈與張署同獲量移、途經郴州相會之作' },
    ]
  },
  97: { // 石鼓歌 / 韓愈
    locs: [
      { place: '鳳翔', modern: '陝西省寶雞市鳳翔區', lat: 34.52, lng: 107.4, relation: 'scene', certainty: 'exact', note: '詩中所詠石鼓當時存放於鳳翔孔廟' },
    ]
  },
  99: { // 金銅仙人辭漢歌 / 李賀
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '詩序寫魏明帝欲將漢代銅仙自長安遷往洛陽的典故' },
    ]
  },
  103: { // 賣炭翁 / 白居易
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '新樂府組詩，批判長安宮市之弊' },
    ]
  },
  111: { // 渡荊門送別 / 李白
    locs: [
      { place: '荊門', modern: '湖北省荊門市', lat: 30.35, lng: 111.35, relation: 'scene', certainty: 'exact', note: '詩題明寫荊門，李白出蜀途中所作' },
    ]
  },
  113: { // 聽蜀僧濬彈琴 / 李白
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於李白長安時期偶遇蜀地僧人' },
    ]
  },
  118: { // 自京金光門出問道歸鳳翔 / 杜甫
    locs: [
      { place: '長安(金光門)', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '詩題明寫自京金光門出，杜甫冒險逃出淪陷長安' },
    ]
  },
  120: { // 天末懷李白 / 杜甫
    locs: [
      { place: '秦州', modern: '甘肅省天水市', lat: 34.58, lng: 105.72, relation: 'scene', certainty: 'approx', note: '杜甫寓居秦州時懷念流放中的李白' },
    ]
  },
  122: { // 別房太尉墓 / 杜甫
    locs: [
      { place: '閬州', modern: '四川省南充市閬中市', lat: 31.56, lng: 105.97, relation: 'scene', certainty: 'exact', note: '杜甫於閬州拜謁亡友房琯墓所作' },
    ]
  },
  125: { // 春夜喜雨 / 杜甫
    locs: [
      { place: '成都草堂', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'exact', note: '杜甫寓居成都草堂期間所作（761）' },
    ]
  },
  127: { // 山居秋暝 / 王維
    locs: [
      { place: '輞川別業', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'approx', note: '王維輞川隱居時期作品' },
    ]
  },
  130: { // 酬張少府 / 王維
    locs: [
      { place: '輞川別業', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'approx', note: '王維輞川半官半隱時期作品' },
    ]
  },
  135: { // 使至塞上 / 王維
    locs: [
      { place: '涼州', modern: '甘肅省武威市', lat: 37.93, lng: 102.64, relation: 'scene', certainty: 'approx', note: '王維開元25年奉使河西節度使幕府所作' },
    ]
  },
  139: { // 歲暮歸南山 / 孟浩然
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '孟浩然應舉落第後離開長安所作' },
      { place: '鹿門山(故鄉)', modern: '湖北省襄陽市', lat: 32.02, lng: 112.17, relation: 'hometown', certainty: 'approx', note: '詩題「歸南山」所指返回的襄陽家鄉' },
    ]
  },
  140: { // 過故人莊 / 孟浩然
    locs: [
      { place: '鹿門山', modern: '湖北省襄陽市', lat: 32.02, lng: 112.17, relation: 'scene', certainty: 'approx', note: '孟浩然襄陽家鄉附近農莊' },
    ]
  },
  148: { // 望月懷遠 / 張九齡
    locs: [
      { place: '荊州', modern: '湖北省荊州市', lat: 30.35, lng: 112.19, relation: 'exile', certainty: 'approx', note: '張九齡貶為荊州長史時期作品' },
    ]
  },
  149: { // 次北固山下 / 王灣
    locs: [
      { place: '北固山', modern: '江蘇省鎮江市', lat: 32.2, lng: 119.45, relation: 'scene', certainty: 'exact', note: '詩題明寫北固山' },
    ]
  },
  151: { // 題破山寺後禪院 / 常建
    locs: [
      { place: '破山寺(興福寺)', modern: '江蘇省蘇州市常熟市', lat: 31.66, lng: 120.75, relation: 'scene', certainty: 'exact', note: '詩題明寫破山寺，即今常熟虞山興福寺' },
    ]
  },
  171: { // 蜀先主廟 / 劉禹錫
    locs: [
      { place: '蜀先主廟', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'scene', certainty: 'exact', note: '劉禹錫任夔州刺史時拜謁劉備廟所作' },
    ]
  },
  190: { // 登金陵鳳凰樓 / 李白
    locs: [
      { place: '鳳凰台', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫金陵鳳凰台' },
    ]
  },
  193: { // 客至 / 杜甫
    locs: [
      { place: '成都草堂', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'exact', note: '杜甫成都草堂時期迎客之作' },
    ]
  },
  196: { // 登高 / 杜甫
    locs: [
      { place: '夔州', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'scene', certainty: 'exact', note: '杜甫寓居夔州（766-768）重陽登高所作，史載明確' },
    ]
  },
  216: { // 錢塘湖春行 / 白居易
    locs: [
      { place: '錢塘湖(西湖)', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'exact', note: '白居易任杭州刺史期間遊西湖所作' },
    ]
  },
  217: { // 寄李儋元錫 / 韋應物
    locs: [
      { place: '滁州', modern: '安徽省滁州市', lat: 32.3, lng: 118.32, relation: 'scene', certainty: 'approx', note: '韋應物任滁州刺史期間作品' },
    ]
  },
  223: { // 遣悲懷三首之二 / 元稹
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '元稹悼亡妻韋叢組詩，與離思其四同期' },
    ]
  },
  225: { // 雁門太守行 / 李賀
    locs: [
      { place: '雁門關', modern: '山西省忻州市代縣', lat: 39.04, lng: 112.95, relation: 'scene', certainty: 'exact', note: '詩題明寫雁門' },
    ]
  },
  226: { // 早春呈水部張十八員外二首 / 韓愈
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '詩句「天街小雨」暗指長安御街' },
    ]
  },
  236: { // 隋宮(乘興南遊) / 李商隱
    locs: [
      { place: '江都(揚州)', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'symbolic', note: '借隋煬帝南遊江都史事諷喻晚唐，非李商隱本人行跡' },
    ]
  },
  247: { // 咸陽城東樓 / 許渾
    locs: [
      { place: '咸陽城樓', modern: '陝西省咸陽市', lat: 34.33, lng: 108.71, relation: 'scene', certainty: 'exact', note: '詩題明寫咸陽城樓' },
    ]
  },
  251: { // 正月二十日與潘郭二生出郊尋春 / 蘇軾
    locs: [
      { place: '黃州', modern: '湖北省黃岡市', lat: 30.45, lng: 114.87, relation: 'exile', certainty: 'exact', note: '蘇軾黃州貶謫時期與友人郊遊之作' },
    ]
  },
  255: { // 自嘲 / 魯迅
    locs: [
      { place: '上海', modern: '上海市', lat: 31.23, lng: 121.47, relation: 'scene', certainty: 'approx', note: '魯迅1932年寓居上海時期作品' },
    ]
  },
  260: { // 獨坐敬亭山 / 李白
    locs: [
      { place: '敬亭山', modern: '安徽省宣城市', lat: 30.95, lng: 118.76, relation: 'scene', certainty: 'exact', note: '詩題明寫敬亭山，位於宣城' },
    ]
  },
  261: { // 八陣圖 / 杜甫
    locs: [
      { place: '八陣圖(夔州)', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'scene', certainty: 'exact', note: '詩題明寫八陣圖，諸葛亮遺跡位於夔州' },
    ]
  },
  264: { // 竹里館 / 王維
    locs: [
      { place: '輞川別業·竹里館', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'exact', note: '輞川二十景之一' },
    ]
  },
  265: { // 送別(山中相送罷) / 王維
    locs: [
      { place: '輞川別業', modern: '陝西省西安市藍田縣', lat: 34.15, lng: 109.32, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於輞川山居時期' },
    ]
  },
  269: { // 宿建德江 / 孟浩然
    locs: [
      { place: '建德江', modern: '浙江省杭州市建德市', lat: 29.47, lng: 119.28, relation: 'scene', certainty: 'exact', note: '詩題明寫建德江' },
    ]
  },
  271: { // 長干行二首之一 / 崔顥
    locs: [
      { place: '長干里', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫長干，金陵舊里巷名' },
    ]
  },
  276: { // 池上 / 白居易
    locs: [
      { place: '履道里宅園', modern: '河南省洛陽市', lat: 34.62, lng: 112.42, relation: 'scene', certainty: 'approx', note: '傳統認為白居易晚年洛陽宅園閒居所作' },
    ]
  },
  278: { // 送崔九 / 裴迪
    locs: [
      { place: '終南山', modern: '陝西省西安市', lat: 34.05, lng: 108.7, relation: 'scene', certainty: 'approx', note: '裴迪為王維輞川詩友，此詩亦屬終南山隱逸圈' },
    ]
  },
  279: { // 送靈澈 / 劉長卿
    locs: [
      { place: '竹林寺', modern: '江蘇省鎮江市', lat: 32.2, lng: 119.45, relation: 'scene', certainty: 'approx', note: '詩句「蒼蒼竹林寺」傳統認為在潤州（今鎮江）一帶' },
    ]
  },
  286: { // 行宮 / 元稹
    locs: [
      { place: '上陽宮', modern: '河南省洛陽市', lat: 34.62, lng: 112.42, relation: 'scene', certainty: 'approx', note: '詩中「古行宮」傳統認為指洛陽上陽宮' },
    ]
  },
  298: { // 渡漢江 / 李頻
    locs: [
      { place: '漢江', modern: '湖北省襄陽市', lat: 32.02, lng: 112.17, relation: 'scene', certainty: 'approx', note: '詩題明寫渡漢江，返鄉途中所作' },
    ]
  },
  305: { // 清平調三首之一 / 李白
    locs: [
      { place: '興慶宮', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '李白供奉翰林期間於長安興慶宮沉香亭應詔所作' },
    ]
  },
  306: { // 清平調三首之二 / 李白
    locs: [
      { place: '興慶宮', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '與之一同組，長安興慶宮應詔所作' },
    ]
  },
  307: { // 清平調三首之三 / 李白
    locs: [
      { place: '興慶宮', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '同組詩，長安興慶宮應詔所作' },
    ]
  },
  308: { // 客中行 / 李白
    locs: [
      { place: '蘭陵', modern: '山東省棗莊市', lat: 34.86, lng: 117.64, relation: 'scene', certainty: 'exact', note: '詩句明寫蘭陵美酒' },
    ]
  },
  309: { // 望天門山 / 李白
    locs: [
      { place: '天門山', modern: '安徽省馬鞍山市當塗縣', lat: 31.63, lng: 118.48, relation: 'scene', certainty: 'exact', note: '詩題明寫天門山' },
    ]
  },
  311: { // 聞王昌齡左遷龍標遙有此寄 / 李白
    locs: [
      { place: '龍標', modern: '湖南省懷化市洪江市', lat: 27.2, lng: 109.98, relation: 'destination', certainty: 'exact', note: '詩題明寫王昌齡左遷龍標，此為其目的地' },
    ]
  },
  312: { // 贈汪倫 / 李白
    locs: [
      { place: '桃花潭', modern: '安徽省宣城市涇縣', lat: 30.67, lng: 118.42, relation: 'scene', certainty: 'exact', note: '汪倫於桃花潭設宴送別李白，史載明確' },
    ]
  },
  313: { // 江南逢李龜年 / 杜甫
    locs: [
      { place: '潭州', modern: '湖南省長沙市', lat: 28.23, lng: 112.94, relation: 'scene', certainty: 'approx', note: '杜甫晚年漂泊潭州時重逢樂師李龜年' },
    ]
  },
  314: { // 絕句-其三(兩個黃鸝鳴翠柳) / 杜甫
    locs: [
      { place: '成都草堂', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'exact', note: '杜甫成都草堂時期寫景之作' },
    ]
  },
  315: { // 贈李白 / 杜甫
    locs: [
      { place: '兗州', modern: '山東省濟寧市兗州區', lat: 35.55, lng: 116.78, relation: 'scene', certainty: 'approx', note: '杜甫與李白同遊齊魯期間所作' },
    ]
  },
  316: { // 贈花卿 / 杜甫
    locs: [
      { place: '成都', modern: '四川省成都市', lat: 30.65, lng: 104.06, relation: 'scene', certainty: 'approx', note: '杜甫寓居成都期間贈蜀將花敬定之作' },
    ]
  },
  317: { // 渭城曲(送元二使安西) / 王維
    locs: [
      { place: '渭城', modern: '陝西省咸陽市', lat: 34.33, lng: 108.71, relation: 'scene', certainty: 'exact', note: '詩題明寫渭城，即今咸陽' },
    ]
  },
  323: { // 芙蓉樓送辛漸 / 王昌齡
    locs: [
      { place: '芙蓉樓', modern: '江蘇省鎮江市', lat: 32.2, lng: 119.45, relation: 'scene', certainty: 'exact', note: '詩題明寫芙蓉樓，位於潤州（今鎮江）' },
    ]
  },
  325: { // 從軍行其四 / 王昌齡
    locs: [
      { place: '青海湖', modern: '青海省海北藏族自治州', lat: 36.8, lng: 100.1, relation: 'scene', certainty: 'exact', note: '詩句明寫「青海長雲暗雪山」' },
    ]
  },
  327: { // 出塞(黃河遠上白雲間) / 王之渙
    locs: [
      { place: '涼州', modern: '甘肅省武威市', lat: 37.93, lng: 102.64, relation: 'scene', certainty: 'exact', note: '本詩又名涼州詞，詩題明寫西北邊塞涼州' },
    ]
  },
  335: { // 浪淘沙-借問江潮與海水 / 白居易
    locs: [
      { place: '錢塘江', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'approx', note: '詠錢塘江潮，與白居易杭州刺史經歷相關' },
    ]
  },
  336: { // 浪淘沙-白浪茫茫與海連 / 白居易
    locs: [
      { place: '錢塘江', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'approx', note: '詠錢塘江潮組詩之一' },
    ]
  },
  337: { // 寄湘靈 / 白居易
    locs: [
      { place: '符離', modern: '安徽省宿州市', lat: 33.63, lng: 117.07, relation: 'scene', certainty: 'approx', note: '白居易早年寓居符離時與初戀湘靈相戀之地' },
    ]
  },
  339: { // 贈婢詩 / 崔郊
    locs: [
      { place: '漢陽', modern: '湖北省武漢市', lat: 30.54, lng: 114.3, relation: 'scene', certainty: 'approx', note: '崔郊與于頔府中婢女的著名軼事發生於漢陽' },
    ]
  },
  340: { // 題都城南莊 / 崔護
    locs: [
      { place: '長安城南', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '人面桃花典故發生於長安城南莊' },
    ]
  },
  342: { // 滁州西澗 / 韋應物
    locs: [
      { place: '滁州西澗', modern: '安徽省滁州市', lat: 32.3, lng: 118.32, relation: 'scene', certainty: 'exact', note: '詩題明寫滁州西澗' },
    ]
  },
  344: { // 寒食 / 韓翃
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '詩句「春城無處不飛花」傳統認為描寫長安' },
    ]
  },
  348: { // 烏衣巷 / 劉禹錫
    locs: [
      { place: '烏衣巷', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫烏衣巷，位於金陵秦淮河畔，至今尚存' },
    ]
  },
  354: { // 台城 / 劉禹錫
    locs: [
      { place: '台城', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫台城，六朝故宮遺址位於金陵' },
    ]
  },
  356: { // 竹枝詞二首-其一 / 劉禹錫
    locs: [
      { place: '夔州', modern: '重慶市奉節縣', lat: 31.03, lng: 109.56, relation: 'exile', certainty: 'approx', note: '劉禹錫任夔州刺史時採集巴渝民歌而作' },
    ]
  },
  357: { // 秋詞 / 劉禹錫
    locs: [
      { place: '朗州', modern: '湖南省常德市', lat: 29.03, lng: 111.69, relation: 'exile', certainty: 'approx', note: '劉禹錫貶謫朗州司馬時期（805-814）作品' },
    ]
  },
  358: { // 遊玄都觀 / 劉禹錫
    locs: [
      { place: '玄都觀', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '詩題明寫玄都觀，位於長安，因此詩再度獲罪貶謫的著名典故' },
    ]
  },
  362: { // 隋宮(紫泉宮殿鎖煙霞) / 李商隱
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'symbolic', note: '借隋代長安宮殿舊事諷喻，非李商隱本人行跡' },
    ]
  },
  365: { // 賈生 / 李商隱
    locs: [
      { place: '未央宮(宣室)', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'symbolic', note: '借漢文帝於未央宮宣室召見賈誼的典故諷喻，非李商隱本人行跡' },
    ]
  },
  366: { // 將赴吳興登樂遊原 / 杜牧
    locs: [
      { place: '樂遊原', modern: '陝西省西安市', lat: 34.24, lng: 108.97, relation: 'scene', certainty: 'exact', note: '詩題明寫樂遊原' },
    ]
  },
  367: { // 赤壁 / 杜牧
    locs: [
      { place: '赤壁(黃州)', modern: '湖北省黃岡市', lat: 30.45, lng: 114.87, relation: 'scene', certainty: 'disputed', note: '杜牧任黃州刺史時所作，黃州「文赤壁」與古戰場真址之爭議自古有之' },
    ]
  },
  369: { // 寄揚州韓綽判官 / 杜牧
    locs: [
      { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'exact', note: '詩題明寫揚州' },
    ]
  },
  370: { // 遣懷 / 杜牧
    locs: [
      { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'exact', note: '詩句明寫「十年一覺揚州夢」' },
    ]
  },
  372: { // 贈別二首之一 / 杜牧
    locs: [
      { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'approx', note: '杜牧揚州任職時期贈別之作' },
    ]
  },
  373: { // 贈別二首之二 / 杜牧
    locs: [
      { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'approx', note: '同組詩，揚州時期作品' },
    ]
  },
  374: { // 金谷園 / 杜牧
    locs: [
      { place: '金谷園', modern: '河南省洛陽市', lat: 34.62, lng: 112.42, relation: 'scene', certainty: 'exact', note: '詩題明寫金谷園，西晉石崇故址位於洛陽' },
    ]
  },
  378: { // 過華清宮絕句三首之一 / 杜牧
    locs: [
      { place: '華清宮', modern: '陝西省西安市臨潼區', lat: 34.37, lng: 109.21, relation: 'scene', certainty: 'exact', note: '詩題明寫華清宮，遺址尚存於臨潼驪山' },
    ]
  },
  379: { // 嘆花 / 杜牧
    locs: [
      { place: '湖州', modern: '浙江省湖州市', lat: 30.89, lng: 120.1, relation: 'scene', certainty: 'approx', note: '杜牧重遊湖州、尋訪昔日相約女子已遲的著名軼事' },
    ]
  },
  380: { // 金陵晚望 / 高蟾
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫金陵' },
    ]
  },
  381: { // 金陵圖二 / 韋莊
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫金陵' },
    ]
  },
  384: { // 集靈臺二首之二 / 張祜
    locs: [
      { place: '集靈臺(華清宮)', modern: '陝西省西安市臨潼區', lat: 34.37, lng: 109.21, relation: 'scene', certainty: 'exact', note: '詩題明寫集靈臺，屬華清宮建築群' },
    ]
  },
  387: { // 近試上張水部 / 朱慶餘
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'approx', note: '朱慶餘應試前於長安投獻張籍之作' },
    ]
  },
  389: { // 馬嵬坡 / 鄭畋
    locs: [
      { place: '馬嵬坡', modern: '陝西省咸陽市興平市', lat: 34.3, lng: 108.44, relation: 'scene', certainty: 'exact', note: '詩題明寫馬嵬坡，楊貴妃殞命處' },
    ]
  },
  391: { // 金陵圖 / 韋莊
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'exact', note: '詩題明寫金陵' },
    ]
  },
  392: { // 隴西行 / 陳陶
    locs: [
      { place: '無定河', modern: '陝西省榆林市', lat: 38.28, lng: 109.73, relation: 'scene', certainty: 'approx', note: '詩句明寫無定河邊，陝北邊塞戰場泛寫' },
    ]
  },
  396: { // 白鹿洞二首之一 / 王貞白
    locs: [
      { place: '白鹿洞', modern: '江西省九江市廬山', lat: 29.55, lng: 115.98, relation: 'scene', certainty: 'exact', note: '詩題明寫白鹿洞書院，位於廬山' },
    ]
  },
  398: { // 飲湖上初晴後雨二首-其二 / 蘇軾
    locs: [
      { place: '西湖', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'exact', note: '詩題明寫西湖' },
    ]
  },
  401: { // 六月二十七日望湖樓醉書 / 蘇軾
    locs: [
      { place: '望湖樓', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'exact', note: '詩題明寫望湖樓，位於杭州西湖畔' },
    ]
  },
  402: { // 泊船瓜洲 / 王安石
    locs: [
      { place: '瓜洲', modern: '江蘇省揚州市瓜洲鎮', lat: 32.21, lng: 119.42, relation: 'scene', certainty: 'exact', note: '詩題明寫瓜洲，長江邊渡口' },
    ]
  },
  403: { // 登飛來峯 / 王安石
    locs: [
      { place: '飛來峰', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'scene', certainty: 'exact', note: '詩題明寫飛來峰，位於杭州靈隱寺旁' },
    ]
  },
  406: { // 冬夜讀書示子聿 / 陸游
    locs: [
      { place: '山陰', modern: '浙江省紹興市', lat: 30, lng: 120.58, relation: 'scene', certainty: 'approx', note: '陸游晚年退居山陰家鄉訓示幼子之作' },
    ]
  },
  410: { // 拜年 / 文徵明
    locs: [
      { place: '蘇州', modern: '江蘇省蘇州市', lat: 31.32, lng: 120.58, relation: 'hometown', certainty: 'approx', note: '文徵明為蘇州人，此詩泛寫江南拜年習俗' },
    ]
  },
  415: { // 敕勒歌 / 佚名
    locs: [
      { place: '敕勒川·陰山', modern: '內蒙古自治區呼和浩特市', lat: 40.8, lng: 111.6, relation: 'scene', certainty: 'exact', note: '詩句明寫「敕勒川，陰山下」' },
    ]
  },
  419: { // 憶秦娥(簫聲咽) / 李白
    locs: [
      { place: '咸陽古道', modern: '陝西省咸陽市', lat: 34.33, lng: 108.71, relation: 'scene', certainty: 'approx', note: '詞中明寫「咸陽古道音塵絕，音塵絕，西風殘照，漢家陵闕」（此詞相傳李白所作，然學界對作者尚有爭議）' },
    ]
  },
  421: { // 憶江南(江南好) / 白居易
    locs: [
      { place: '杭州', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'hometown', certainty: 'approx', note: '詞句「郡亭枕上看潮頭」對應白居易杭州刺史回憶' },
    ]
  },
  423: { // 漁歌子-西塞山前白鷺飛 / 張志和
    locs: [
      { place: '西塞山', modern: '浙江省湖州市', lat: 30.89, lng: 120.1, relation: 'scene', certainty: 'approx', note: '張志和與顏真卿同遊湖州西塞山時所作' },
    ]
  },
  426: { // 菩薩蠻（其五） / 韋莊
    locs: [
      { place: '洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.42, relation: 'hometown', certainty: 'exact', note: '詞句明寫「洛陽城裡春光好，洛陽才子他鄉老」' },
    ]
  },
  428: { // 木蘭花·曉妝初了明肌雪 / 李煜
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'approx', note: '李煜尚為南唐國主時期的宮廷生活寫照' },
    ]
  },
  429: { // 菩薩蠻·花明月暗籠輕霧 / 李煜
    locs: [
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'scene', certainty: 'approx', note: '李煜與小周后宮中幽會之作，南唐尚在時期' },
    ]
  },
  431: { // 浪淘沙令-簾外雨潺潺 / 李煜
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '李煜亡國後被囚汴京時期作品' },
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '詞中懷念的故國南唐都城' },
    ]
  },
  432: { // 相見歡-無言獨上西樓 / 李煜
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '亡國後囚居汴京時期作品' },
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '懷念故國南唐都城' },
    ]
  },
  433: { // 相見歡-林花謝了春紅 / 李煜
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '亡國後囚居汴京時期作品' },
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '懷念故國南唐都城' },
    ]
  },
  434: { // 破陣子-四十年來家國 / 李煜
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '亡國後囚居汴京時回顧四十年家國之作' },
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '詞中「四十年家國」所指的南唐都城' },
    ]
  },
  435: { // 子夜歌·人生愁恨何能免 / 李煜
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'exact', note: '亡國後囚居汴京時期作品' },
      { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, relation: 'hometown', certainty: 'exact', note: '懷念故國南唐都城' },
    ]
  },
  437: { // 江城子-乙卯正月二十日夜記夢 / 蘇軾
    locs: [
      { place: '密州', modern: '山東省濰坊市諸城市', lat: 35.99, lng: 119.41, relation: 'scene', certainty: 'exact', note: '詞題明寫乙卯年(1075)，蘇軾任密州知州時悼念亡妻王弗之作' },
    ]
  },
  438: { // 西江月 / 蘇軾
    locs: [
      { place: '黃州', modern: '湖北省黃岡市', lat: 30.45, lng: 114.87, relation: 'exile', certainty: 'approx', note: '傳統箋注繫於蘇軾黃州貶謫時期中秋之作' },
    ]
  },
  439: { // 西江月-平山堂 / 蘇軾
    locs: [
      { place: '平山堂', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, relation: 'scene', certainty: 'exact', note: '詩題明寫平山堂，歐陽修建於揚州，蘇軾登臨懷師之作' },
    ]
  },
  441: { // 念奴嬌-赤壁懷古 / 蘇軾
    locs: [
      { place: '赤壁(黃州)', modern: '湖北省黃岡市', lat: 30.45, lng: 114.87, relation: 'exile', certainty: 'exact', note: '蘇軾黃州貶謫時期遊黃州赤壁磯所作' },
    ]
  },
  446: { // 雨霖鈴·寒蟬淒切 / 柳永
    locs: [
      { place: '汴京', modern: '河南省開封市', lat: 34.8, lng: 114.35, relation: 'scene', certainty: 'approx', note: '詞中「都門帳飲」指柳永離開汴京南下的送別場景' },
    ]
  },
  448: { // 如夢令-常記溪亭日暮 / 李清照
    locs: [
      { place: '濟南', modern: '山東省濟南市', lat: 36.65, lng: 117.12, relation: 'hometown', certainty: 'approx', note: '李清照早年少女時期於故鄉濟南所作' },
    ]
  },
  449: { // 點絳脣·蹴罷鞦韆 / 李清照
    locs: [
      { place: '濟南', modern: '山東省濟南市', lat: 36.65, lng: 117.12, relation: 'hometown', certainty: 'approx', note: '傳統認為李清照少女時期於故鄉濟南所作' },
    ]
  },
  450: { // 一剪梅-紅藕香殘玉簟秋 / 李清照
    locs: [
      { place: '青州', modern: '山東省濰坊市青州市', lat: 36.68, lng: 118.48, relation: 'scene', certainty: 'approx', note: '趙明誠外出遠遊，李清照獨居青州時所作' },
    ]
  },
  451: { // 醉花陰-薄霧濃雲愁永晝 / 李清照
    locs: [
      { place: '青州', modern: '山東省濰坊市青州市', lat: 36.68, lng: 118.48, relation: 'scene', certainty: 'approx', note: '與趙明誠分隔兩地時期作品（重陽思夫）' },
    ]
  },
  452: { // 鳳凰臺上憶吹簫·香冷金猊 / 李清照
    locs: [
      { place: '青州', modern: '山東省濰坊市青州市', lat: 36.68, lng: 118.48, relation: 'scene', certainty: 'approx', note: '傳統箋注繫於趙明誠離家赴任、李清照獨居青州時期' },
    ]
  },
  453: { // 聲聲慢-尋尋覓覓 / 李清照
    locs: [
      { place: '臨安', modern: '浙江省杭州市', lat: 30.25, lng: 120.17, relation: 'exile', certainty: 'approx', note: '李清照晚年南渡流離、喪夫後於臨安一帶所作' },
    ]
  },
  454: { // 武陵春·春晚 / 李清照
    locs: [
      { place: '金華', modern: '浙江省金華市', lat: 29.11, lng: 119.65, relation: 'exile', certainty: 'exact', note: '詞中「雙溪」即金華雙溪，李清照避難金華時所作' },
    ]
  },
  455: { // 夏日絕句 / 李清照
    locs: [
      { place: '烏江', modern: '安徽省馬鞍山市和縣烏江鎮', lat: 31.58, lng: 118.32, relation: 'scene', certainty: 'exact', note: '南渡途經項羽自刎的烏江渡口有感而作' },
    ]
  },
  458: { // 破陣子-為陳同甫賦壯詞以寄之 / 辛棄疾
    locs: [
      { place: '帶湖', modern: '江西省上饒市', lat: 28.02, lng: 117.71, relation: 'exile', certainty: 'approx', note: '辛棄疾閒居上饒帶湖時期寄贈陳亮之作' },
    ]
  },
  461: { // 釵頭鳳-世情薄 / 唐婉
    locs: [
      { place: '沈園', modern: '浙江省紹興市', lat: 30, lng: 120.58, relation: 'scene', certainty: 'exact', note: '唐婉與陸游沈園重逢的著名軼事，沈園至今尚存' },
    ]
  },
  462: { // 唐多令‧蘆葉滿汀洲 / 劉過
    locs: [
      { place: '安遠樓(黃鶴樓畔)', modern: '湖北省武漢市', lat: 30.54, lng: 114.3, relation: 'scene', certainty: 'exact', note: '詞序明寫安遠樓小集，即黃鶴樓一帶' },
    ]
  },
  465: { // 登科后 / 孟郊
    locs: [
      { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, relation: 'scene', certainty: 'exact', note: '詩句明寫「一日看盡長安花」，孟郊46歲及第之作' },
    ]
  },
  466: { // 陋室銘 / 劉禹錫
    locs: [
      { place: '和州陋室', modern: '安徽省馬鞍山市和縣', lat: 31.73, lng: 118.35, relation: 'exile', certainty: 'exact', note: '劉禹錫貶謫和州通判時所築陋室，典故明確' },
    ]
  },

};

// 若在 Node.js 環境，匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = POEM_LOCATIONS;
}
