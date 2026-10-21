import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const d=JSON.parse(fs.readFileSync(path.join(root,'content.json'),'utf8'));
const title='大呂的音樂，未完待續 '+d.version;
const lines=[title+'｜呂彥慶生涯與音樂歷史校對稿','整理日期：'+d.updated,'',
 '用途：提供家屬、樂團、校友與相關人員逐項核對。請在每筆後方填寫修正與證據來源。',
 '收錄範圍：'+d.career.length+' 個生涯節點；'+d.concerts.length+' 筆演出／活動檔案；'+d.concerts.reduce((n,c)=>n+c.rows.length,0)+' 筆曲目資料。曲目包含原定、取消及待核紀錄，不等於已完成演出次數。',
 '資料原則：未查到的日期、團體、地點、曲目及編曲保留缺項；不以同名音樂會推定完全相同節目。現場演出、線上重播、行前計畫與取消場次分開註明。',
 '作品可能有中外文異名與不同譯名，尚待人工整併。來源列名為歌手或編曲者時，不擅自改成作曲者。',
 '背景音樂：Simple Gift: Here Take This Lovely Flower／Frank Ticheli（FCUSB Program）',
 '音樂來源：https://www.youtube.com/watch?v=n7mhsJLAsVk','',
 '一、優先校對與未補齊項目','='.repeat(60),...d.researchGaps.map((s,i)=>(i+1)+'. '+s),'',
 '二、生涯時間軸（從出生開始）','='.repeat(60)];
for(const [i,c] of d.career.entries())lines.push('',`【生涯 ${String(i+1).padStart(2,'0')}】${c.label}｜${c.title}`,c.description,'來源：'+c.source,'校對修正：____________________');
lines.push('','三、逐場演出／活動與曲目','='.repeat(60));
for(const [i,c] of d.concerts.entries()){
 lines.push('',`【紀錄 ${String(i+1).padStart(2,'0')}｜ID ${c.id}】${c.title}`,
 '日期：'+(c.dateLabel||c.date),'時間：'+(c.time||'來源未載／待核對'),
 '團體：'+c.ens,'地點：'+c.place,'指揮：'+c.cond,'呂彥慶身分：'+(c.role||'指揮（與共同列名指揮之分工待節目冊核對）'),
 '紀錄狀態：'+({cancelled:'已取消；以下為原定節目',planned:'行前計畫；實際演出情形待核對','date-pending':'演出日期待核對'}[c.status]||'公開演出紀錄'),
 '演出資訊：'+(c.story||'詳見原始來源'),
 '曲目：');
 if(!c.rows.length)lines.push('  尚未找到可核對曲目，請提供本場節目單。');
 for(const [j,r] of c.rows.entries())lines.push(`  ${j+1}. ${r.zh||r.orig}${r.orig&&r.zh?'｜'+r.orig:''}`,
   '     作曲／原公告署名：'+(r.composer||'來源未載／待核對')+'；編曲：'+(r.arr||'來源未載／待核對'),
   '     曲目來源：'+(r.source||c.source));
 lines.push('校訂備註：'+(c.rowsNote||'原公告可能與當日演出有異；請以節目冊與現場紀錄確認。'),
   ...[...new Set(c.sources||[c.source])].map((url,k)=>'來源 '+(k+1)+'：'+url),
   '日期／團體／地點修正：____________________',
   '曲目／作曲／編曲修正：____________________',
   '補充來源／校對者：____________________');
}
lines.push('','四、原版保留的其他校訂事項','='.repeat(60),...d.editorNotes.filter(x=>!d.researchGaps.includes(x)).map((s,i)=>(i+1)+'. '+s),'',
 '工程交接：網頁資料以 content.json 為準。本稿由相同資料產生；直接修改本 TXT 不會同步修改網頁。請將核對後內容交回工程端匯入。',
 '網站使用範圍：內建紀錄可上架供瀏覽；訪客投稿目前仍只存本機瀏覽器，尚未串接共用收件資料庫。');
const file=title+'－生涯與音樂歷史校對.txt';
fs.writeFileSync(path.join(root,file),'\ufeff'+lines.join('\r\n')+'\r\n');
console.log(file+' / '+lines.length+' lines');
