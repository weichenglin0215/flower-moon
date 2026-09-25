// ============================================================
// 詩人故鄉資料模組（詩路地圖「詩人故鄉」分頁 用）
// ------------------------------------------------------------
// 收錄 data/poems.js 中有記載的詩人籍貫（出生地或公認故里），供地圖上
// 以綠點＋詩人名稱標示。綠點尺寸由 map.js 依 POEMS 加總該詩人所有詩詞
// 評價現算即時決定，這裡只需提供地點座標。
//
// 欄位說明：
//   place      -- 傳統籍貫寫法（古地名）
//   modern     -- 現代行政區對應地名
//   lat / lng  -- WGS-84 概略經緯度（城市級精度，非測繪級）
//   certainty  -- exact=正史/年譜明載籍貫或出生地
//                 approx=多數傳記文獻採信但非正史明載
//                 symbolic=生平記載稀少、籍貫眾說紛紜，僅取最常見一說
//
// 未收錄（籍貫不可考或非個人作者，故意不標點）：
//   佚名（漢樂府）、詩經（合集非個人）、無名氏、西鄙人、崔郊
// ============================================================

const AUTHOR_HOMETOWNS = {
  '李白': { place: '綿州昌隆', modern: '四川省江油市', lat: 31.78, lng: 104.75, certainty: 'approx' },
  '杜甫': { place: '河南鞏縣', modern: '河南省鞏義市', lat: 34.75, lng: 112.98, certainty: 'exact' },
  '王維': { place: '蒲州', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, certainty: 'exact' },
  '白居易': { place: '河南新鄭', modern: '河南省鄭州市新鄭市', lat: 34.40, lng: 113.73, certainty: 'exact' },
  '李商隱': { place: '懷州河內', modern: '河南省焦作市沁陽市', lat: 35.09, lng: 112.94, certainty: 'approx' },
  '杜牧': { place: '京兆萬年', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'exact' },
  '蘇軾': { place: '眉州眉山', modern: '四川省眉山市', lat: 29.58, lng: 103.85, certainty: 'exact' },
  '李清照': { place: '齊州章丘', modern: '山東省濟南市章丘區', lat: 36.68, lng: 117.53, certainty: 'exact' },
  '李煜': { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, certainty: 'exact' },
  '劉禹錫': { place: '彭城', modern: '江蘇省徐州市', lat: 34.20, lng: 117.28, certainty: 'approx' },
  '王昌齡': { place: '京兆長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'approx' },
  '孟浩然': { place: '襄州襄陽', modern: '湖北省襄陽市', lat: 32.02, lng: 112.14, certainty: 'exact' },
  '韋莊': { place: '京兆杜陵', modern: '陝西省西安市', lat: 34.20, lng: 108.98, certainty: 'approx' },
  '韋應物': { place: '京兆長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'exact' },
  '劉長卿': { place: '河間', modern: '河北省滄州市河間市', lat: 38.44, lng: 116.09, certainty: 'approx' },
  '元稹': { place: '河南洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.45, certainty: 'exact' },
  '辛棄疾': { place: '濟南歷城', modern: '山東省濟南市', lat: 36.65, lng: 117.00, certainty: 'exact' },
  '張九齡': { place: '韶州曲江', modern: '廣東省韶關市', lat: 24.81, lng: 113.60, certainty: 'exact' },
  '孟郊': { place: '湖州武康', modern: '浙江省湖州市德清縣', lat: 30.54, lng: 119.97, certainty: 'approx' },
  '韓愈': { place: '河南河陽', modern: '河南省焦作市孟州市', lat: 34.90, lng: 112.75, certainty: 'approx' },
  '王安石': { place: '撫州臨川', modern: '江西省撫州市', lat: 27.95, lng: 116.36, certainty: 'exact' },
  '岑參': { place: '荊州江陵', modern: '湖北省荊州市', lat: 30.35, lng: 112.19, certainty: 'approx' },
  '王勃': { place: '絳州龍門', modern: '山西省運城市河津市', lat: 35.60, lng: 110.72, certainty: 'exact' },
  '賈島': { place: '范陽', modern: '河北省保定市涿州市', lat: 39.48, lng: 115.97, certainty: 'exact' },
  '王之渙': { place: '絳州', modern: '山西省運城市新絳縣', lat: 35.62, lng: 111.22, certainty: 'approx' },
  '崔顥': { place: '汴州', modern: '河南省開封市', lat: 34.80, lng: 114.35, certainty: 'approx' },
  '李益': { place: '隴西姑臧', modern: '甘肅省武威市', lat: 37.93, lng: 102.64, certainty: 'approx' },
  '陸游': { place: '越州山陰', modern: '浙江省紹興市', lat: 30.00, lng: 120.58, certainty: 'exact' },
  '張祜': { place: '清河', modern: '河北省邢台市清河縣', lat: 37.07, lng: 115.67, certainty: 'approx' },
  '賀知章': { place: '越州永興', modern: '浙江省杭州市蕭山區', lat: 30.18, lng: 120.22, certainty: 'exact' },
  '曹操': { place: '沛國譙縣', modern: '安徽省亳州市', lat: 33.87, lng: 115.78, certainty: 'exact' },
  '高適': { place: '滄州蓨縣', modern: '河北省衡水市景縣', lat: 37.69, lng: 115.97, certainty: 'approx' },
  '柳宗元': { place: '京兆長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'approx' },
  '李賀': { place: '河南福昌昌谷', modern: '河南省洛陽市宜陽縣', lat: 34.52, lng: 112.17, certainty: 'exact' },
  '溫庭筠': { place: '太原祁縣', modern: '山西省晉中市祁縣', lat: 37.35, lng: 112.34, certainty: 'approx' },
  '袁枚': { place: '錢塘', modern: '浙江省杭州市', lat: 30.27, lng: 120.15, certainty: 'exact' },
  '李頎': { place: '河南潁陽', modern: '河南省鄭州市登封市', lat: 34.45, lng: 113.05, certainty: 'approx' },
  '李紳': { place: '潤州無錫', modern: '江蘇省無錫市', lat: 31.57, lng: 120.30, certainty: 'approx' },
  '張繼': { place: '襄州', modern: '湖北省襄陽市', lat: 32.02, lng: 112.14, certainty: 'approx' },
  '陶淵明': { place: '潯陽柴桑', modern: '江西省九江市', lat: 29.71, lng: 115.98, certainty: 'exact' },
  '陳子昂': { place: '梓州射洪', modern: '四川省遂寧市射洪市', lat: 30.87, lng: 105.38, certainty: 'exact' },
  '文天祥': { place: '吉州廬陵', modern: '江西省吉安市', lat: 27.11, lng: 114.98, certainty: 'exact' },
  '王翰': { place: '并州晉陽', modern: '山西省太原市', lat: 37.87, lng: 112.55, certainty: 'approx' },
  '朱慶餘': { place: '越州', modern: '浙江省紹興市', lat: 30.00, lng: 120.58, certainty: 'approx' },
  '杜秋娘': { place: '金陵', modern: '江蘇省南京市', lat: 32.05, lng: 118.78, certainty: 'approx' },
  '高鼎': { place: '仁和', modern: '浙江省杭州市', lat: 30.27, lng: 120.15, certainty: 'symbolic' },
  '秦觀': { place: '揚州高郵', modern: '江蘇省揚州市高郵市', lat: 32.78, lng: 119.45, certainty: 'exact' },
  '馬致遠': { place: '大都', modern: '北京市', lat: 39.90, lng: 116.41, certainty: 'approx' },
  '楊慎': { place: '四川新都', modern: '四川省成都市新都區', lat: 30.82, lng: 104.16, certainty: 'exact' },
  '張若虛': { place: '揚州', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, certainty: 'approx' },
  '常建': { place: '長安', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'symbolic' },
  '許渾': { place: '潤州丹陽', modern: '江蘇省鎮江市丹陽市', lat: 32.00, lng: 119.58, certainty: 'exact' },
  '韓翃': { place: '南陽', modern: '河南省南陽市', lat: 33.00, lng: 112.53, certainty: 'approx' },
  '秦韜玉': { place: '京兆', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'symbolic' },
  '黃庭堅': { place: '洪州分寧', modern: '江西省九江市修水縣', lat: 29.02, lng: 114.55, certainty: 'exact' },
  '納蘭性德': { place: '京師', modern: '北京市', lat: 39.90, lng: 116.41, certainty: 'exact' },
  '崔護': { place: '博陵', modern: '河北省保定市定州市', lat: 38.51, lng: 114.99, certainty: 'approx' },
  '劉方平': { place: '河南洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.45, certainty: 'symbolic' },
  '張泌': { place: '淮南', modern: '江蘇省揚州市', lat: 32.39, lng: 119.41, certainty: 'symbolic' },
  '王貞白': { place: '信州永豐', modern: '江西省上饒市廣豐區', lat: 28.44, lng: 118.19, certainty: 'exact' },
  '龔自珍': { place: '仁和', modern: '浙江省杭州市', lat: 30.27, lng: 120.15, certainty: 'exact' },
  '施耐庵': { place: '平江路', modern: '江蘇省蘇州市', lat: 31.30, lng: 120.62, certainty: 'approx' },
  '岳飛': { place: '相州湯陰', modern: '河南省安陽市湯陰縣', lat: 35.93, lng: 114.36, certainty: 'exact' },
  '劉過': { place: '吉州太和', modern: '江西省吉安市泰和縣', lat: 26.79, lng: 114.90, certainty: 'approx' },
  '王灣': { place: '洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.45, certainty: 'approx' },
  '錢起': { place: '吳興', modern: '浙江省湖州市', lat: 30.89, lng: 120.09, certainty: 'exact' },
  '魯迅': { place: '紹興', modern: '浙江省紹興市', lat: 30.00, lng: 120.58, certainty: 'exact' },
  '裴迪': { place: '關中', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'symbolic' },
  '王建': { place: '潁川', modern: '河南省許昌市', lat: 34.03, lng: 113.85, certainty: 'approx' },
  '盧綸': { place: '河中蒲州', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, certainty: 'approx' },
  '李頻': { place: '睦州壽昌', modern: '浙江省杭州市建德市', lat: 29.48, lng: 119.28, certainty: 'exact' },
  '高蟾': { place: '河朔', modern: '河北省滄州市一帶', lat: 38.30, lng: 116.83, certainty: 'symbolic' },
  '鄭畋': { place: '滎陽', modern: '河南省鄭州市滎陽市', lat: 34.79, lng: 113.38, certainty: 'exact' },
  '陳陶': { place: '鄱陽', modern: '江西省上饒市鄱陽縣', lat: 29.02, lng: 116.69, certainty: 'symbolic' },
  '朱熹': { place: '福建尤溪', modern: '福建省三明市尤溪縣', lat: 26.17, lng: 117.86, certainty: 'exact' },
  '楊萬里': { place: '吉州吉水', modern: '江西省吉安市吉水縣', lat: 27.22, lng: 114.98, certainty: 'exact' },
  '葉紹翁': { place: '建安', modern: '福建省南平市建甌市', lat: 27.03, lng: 118.30, certainty: 'approx' },
  '于謙': { place: '杭州錢塘', modern: '浙江省杭州市', lat: 30.27, lng: 120.15, certainty: 'exact' },
  '鄭燮': { place: '揚州興化', modern: '江蘇省泰州市興化市', lat: 32.91, lng: 119.85, certainty: 'exact' },
  '張志和': { place: '婺州金華', modern: '浙江省金華市', lat: 29.08, lng: 119.65, certainty: 'exact' },
  '晏殊': { place: '撫州臨川', modern: '江西省撫州市', lat: 27.95, lng: 116.36, certainty: 'exact' },
  '柳永': { place: '崇安', modern: '福建省武夷山市', lat: 27.75, lng: 118.03, certainty: 'approx' },
  '蔣捷': { place: '常州宜興', modern: '江蘇省無錫市宜興市', lat: 31.36, lng: 119.82, certainty: 'exact' },
  '邱為': { place: '嘉興', modern: '浙江省嘉興市', lat: 30.75, lng: 120.75, certainty: 'symbolic' },
  '李端': { place: '趙州', modern: '河北省石家莊市趙縣', lat: 37.77, lng: 114.77, certainty: 'symbolic' },
  '文徵明': { place: '長洲', modern: '江蘇省蘇州市', lat: 31.30, lng: 120.62, certainty: 'exact' },
  '歐陽修': { place: '吉州廬陵', modern: '江西省吉安市', lat: 27.11, lng: 114.98, certainty: 'exact' },
  '唐婉': { place: '越州山陰', modern: '浙江省紹興市', lat: 30.00, lng: 120.58, certainty: 'symbolic' },
  '綦毋潛': { place: '虔州', modern: '江西省贛州市', lat: 25.85, lng: 114.94, certainty: 'approx' },
  '沈佺期': { place: '相州內黃', modern: '河南省安陽市內黃縣', lat: 35.95, lng: 114.90, certainty: 'approx' },
  '劉脊虛': { place: '洪州', modern: '江西省南昌市', lat: 28.68, lng: 115.86, certainty: 'symbolic' },
  '張籍': { place: '蘇州吳', modern: '江蘇省蘇州市', lat: 31.30, lng: 120.62, certainty: 'approx' },
  '杜荀鶴': { place: '池州石埭', modern: '安徽省池州市石台縣', lat: 30.21, lng: 117.48, certainty: 'exact' },
  '權德輿': { place: '潤州丹徒', modern: '江蘇省鎮江市', lat: 32.20, lng: 119.45, certainty: 'approx' },
  '張仲素': { place: '河間', modern: '河北省滄州市河間市', lat: 38.44, lng: 116.09, certainty: 'symbolic' },
  '張旭': { place: '蘇州吳縣', modern: '江蘇省蘇州市', lat: 31.30, lng: 120.62, certainty: 'exact' },
  '元結': { place: '河南魯山', modern: '河南省平頂山市魯山縣', lat: 33.74, lng: 112.90, certainty: 'symbolic' },
  '張喬': { place: '池州', modern: '安徽省池州市', lat: 30.66, lng: 117.49, certainty: 'symbolic' },
  '僧皎然': { place: '湖州', modern: '浙江省湖州市', lat: 30.89, lng: 120.09, certainty: 'approx' },
  '薛逢': { place: '蒲州河東', modern: '山西省運城市永濟市', lat: 34.87, lng: 110.29, certainty: 'symbolic' },
  '祖詠': { place: '洛陽', modern: '河南省洛陽市', lat: 34.62, lng: 112.45, certainty: 'symbolic' },
  '韓偓': { place: '京兆萬年', modern: '陝西省西安市', lat: 34.27, lng: 108.95, certainty: 'approx' },
};

// 若在 Node.js 環境，匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AUTHOR_HOMETOWNS;
}
