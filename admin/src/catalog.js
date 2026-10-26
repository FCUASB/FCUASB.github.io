import { validateCatalogDocument } from '../../shared/catalog.mjs';
import assets from '../../handoff-v1.1/工程檔/assets.json' with { type: 'json' };
const memoryAssets=new Map(assets.filter(a=>!a.error&&/^assets\/[A-Za-z0-9_.-]+$/.test(a.path)).map(a=>[a.key,a]));
export function mountCatalog({ api, task, notice, getRole, enabled }) {
  const $ = id => document.getElementById(id);
  let rows = [], generation = 0, editGeneration = 0;
  const editable = () => ['system_admin','content_admin'].includes(getRole());
  const node = (tag, text) => { const e = document.createElement(tag); if (text != null) e.textContent = text; return e; };
  const button = (label, fn) => { const e = node('button', label); e.type = 'button'; e.onclick = () => task(fn, e); return e; };
  function field(box, label, value = '', multiline = false, required = false) {
    const wrap = node('label', label), input = node(multiline ? 'textarea' : 'input');
    if (multiline) input.rows = 3;
    input.value = String(value ?? ''); input.required = required; input.maxLength = multiline ? 5000 : 2000;
    wrap.append(input); box.append(wrap); return input;
  }
  function listEditor(box, items, definitions, makeDefault) {
    const list = node('div'), controls = [];
    const add = value => {
      const row = node('fieldset'); row.append(node('legend', '第 ' + (controls.length + 1) + ' 筆'));
      const entry = { value: structuredClone(value), inputs: {}, row };
      for (const [key,label,multiline,required] of definitions) entry.inputs[key] = field(row,label,value[key],multiline,required);
      row.append(button('移除這筆', () => { row.remove(); controls.splice(controls.indexOf(entry),1); }));
      controls.push(entry); list.append(row);
    };
    items.forEach(add); box.append(list,button('新增一筆', () => { if (controls.length >= 100) throw Error('最多 100 筆。'); add(makeDefault()); }));
    return () => controls.map(({ value, inputs }) => {
      for (const [key,input] of Object.entries(inputs)) value[key] = key === 'timelineOrder' ? Number(input.value) : input.value.trim();
      return value;
    });
  }
  function openEditor(record, type) {
    const editorVersion = ++editGeneration;
    const form = $('catalog-edit-form'); form.replaceChildren();
    form.append(node('h2', type === 'concert' ? '編輯音樂會' : type === 'memory' ? '編輯既有回憶' : '編輯大呂生平'));
    form.append(node('p', '儲存後會更新網站公開內容。請保留來源及尚待核對的註記。'));
    const feedback=node('p');feedback.setAttribute('role','status');feedback.className='catalog-error';form.append(feedback);
    const original = structuredClone(record.document), inputs = {};
    let collect;
    if (type === 'concert') {
      for (const [key,label,multi,required] of [['title','音樂會名稱',false,true],['date','日期（YYYY 或 YYYY-MM-DD）',false,true],['dateLabel','日期顯示文字（不確定時保留註記）'],['time','時間'],['place','地點'],['ens','演出團體'],['cond','指揮'],['role','大呂的身分'],['host','主辦單位'],['story','介紹',true],['source','主要來源網址'],['sourceName','來源名稱'],['sourceNote','待核對／來源註記',true],['rowsNote','曲目註記',true]]) inputs[key] = field(form,label,original[key],multi,required);
      const status = node('label','紀錄狀態'), select = node('select');
      for (const [value,label] of [['','已核對'],['planned','行前計畫'],['cancelled','已取消'],['date-pending','日期待核對']]) { const option=node('option',label); option.value=value; select.append(option); }
      select.value=original.status || ''; status.append(select); form.append(status);
      form.append(node('h3','曲目（原有圖片、影片與補充來源會保留）'));
      const getRows=listEditor(form,original.rows || [],[['zh','曲名'],['orig','原文曲名'],['composer','作曲家'],['arr','編曲'],['source','曲目來源網址']],()=>({zh:'',orig:'',composer:'',arr:'',source:''}));
      collect=()=>{
        const next={...original}; for(const [key,input] of Object.entries(inputs)) next[key]=input.value.trim();
        next.year=Number(next.date.slice(0,4)); next.timelineOrder=Number(next.date.replaceAll('-','').padEnd(8,'0'));
        next.status=select.value; next.rows=getRows();
        // Update the primary link without silently discarding additional provenance.
        if (Array.isArray(next.sources)) next.sources=[...new Set([next.source,...next.sources.filter(url=>url!==original.source)].filter(Boolean))];
        return next;
      };
    } else if(type === 'memory') {
      for(const [key,label,multi,required] of [['n','原署名／標題',false,true],['story','回憶文字',true],['y','年份（不明留白）'],['m','月份（不明留白）'],['place','地點／說明'],['source','來源網址'],['sourceName','來源名稱'],['sourceNote','來源／署名待核對註記',true]])inputs[key]=field(form,label,original[key],multi,required);
      form.append(node('p','這是原有公開資料，並非網站新投稿。保留原始收錄順序，不推定投稿日期。'));
      const mediaLabel=node('label','原有媒體'),media=node('select');
      for(const [value,label] of [['keep','保留原有照片／影片'],['remove','移除此筆媒體，保留文字與來源']]){const option=node('option',label);option.value=value;media.append(option);}
      media.value='keep';mediaLabel.append(media);if(original.type!=='text')form.append(mediaLabel);
      collect=()=>{
        const next={...original};for(const [key,input] of Object.entries(inputs))next[key]=['y','m'].includes(key)?(input.value.trim()?Number(input.value):null):input.value.trim();
        if(media.value==='remove'){next.type='text';delete next.asset;delete next.youtube;delete next.externalVideo;}
        return next;
      };
    } else {
      inputs.biography=field(form,'生平介紹',original.biography,true,true);
      inputs.biographyMore=field(form,'補充介紹',original.biographyMore,true);
      form.append(node('h3','生涯時間軸（排序值例如 19770000；不確定日期請保留文字註記）'));
      const getCareer=listEditor(form,original.career || [],[['label','時間標籤',false,true],['title','事件名稱',false,true],['description','內容',true,true],['source','來源網址'],['sourceNote','待核對／來源註記',true],['timelineOrder','時間軸排序值',false,true]],()=>({label:'',title:'',description:'',source:'',sourceNote:'',timelineOrder:19770000}));
      collect=()=>({...original,biography:inputs.biography.value.trim(),biographyMore:inputs.biographyMore.value.trim(),career:getCareer().sort((a,b)=>a.timelineOrder-b.timelineOrder)});
    }
    const actions=node('div'); actions.className='actions';
    const save=node('button','儲存並更新網站'); save.type='submit'; actions.append(save,button('取消',()=>{editGeneration++;$('catalog-edit-dialog').close()})); form.append(actions);
    form.onsubmit=event=>{event.preventDefault();task(async()=>{
      try{
        feedback.textContent='';
        const document=validateCatalogDocument(type,collect());
        await api('catalog.save',{kind:type,id:record.entry_id,revision:record.revision,document});
        if(editorVersion!==editGeneration)return;
        $('catalog-edit-dialog').close(); await load(type); notice('已儲存；網站下次同步會更新。');
      }catch(error){feedback.textContent=error.message||'儲存失敗，填寫內容仍保留。';throw error;}
    },save);};
    $('catalog-edit-dialog').showModal();
  }
  function renderConcerts() {
    const results=$('concert-results'); results.replaceChildren();
    const query=$('concert-query').value.trim().toLowerCase(), filter=$('concert-filter').value;
    const selected=rows.filter(r=>JSON.stringify([r.document.title,r.document.ens,r.document.date,r.document.place,r.entry_id]).toLowerCase().includes(query)
      && (filter==='all'||(filter==='deleted')===!!r.deleted_at));
    $('concert-count').textContent=`${selected.length} 筆音樂會。`;
    for(const record of selected.sort((a,b)=>Number(a.document.timelineOrder||a.document.year*10000)-Number(b.document.timelineOrder||b.document.year*10000))){
      const item=node('article'); item.append(node('h3',record.document.title),node('p',`${record.document.dateLabel||record.document.date} · ${record.document.ens} · ${record.deleted_at?'已下架':'公開中'}`));
      const actions=node('div'); actions.className='actions';
      if(editable())actions.append(button('編輯',()=>openEditor(record,'concert')),button(record.deleted_at?'恢復公開':'下架',async()=>{
        if(!confirm(record.deleted_at?'恢復這場音樂會公開？':'下架這場音樂會？原始資料與版本仍保留。'))return;
        await api('catalog.visibility',{kind:'concert',id:record.entry_id,revision:record.revision,deleted:!record.deleted_at}); await load('concert');
      }));
      actions.append(button('版本紀錄',()=>history(record,'concert'))); item.append(actions); results.append(item);
    }
    if(!selected.length)results.append(node('p','沒有符合條件的音樂會。'));
  }
  async function history(record,type){
    const currentGeneration=generation, events=await api('catalog.history',{kind:type,id:record.entry_id}); if(currentGeneration!==generation)return;
    $('catalog-history').replaceChildren(node('h2','版本紀錄'));
    for(const version of events){
      const item=node('article');item.append(node('p',`版本 ${version.revision} · ${version.created_at} · ${version.deleted_at?'已下架':'公開中'}`));
      const details=node('details');details.append(node('summary','檢視此版內容')); const pre=node('pre',JSON.stringify(version.document,null,2));details.append(pre);item.append(details);
      if(editable())item.append(button('以此版本重新編輯',()=>openEditor({...record,document:version.document},type)));
      $('catalog-history').append(item);
    }
    if(!events.length)$('catalog-history').append(node('p','尚無變更紀錄。'));
    $('catalog-history').hidden=false;
  }
  async function load(type){
    if(!enabled)throw Error('音樂會與生平雲端管理尚未啟用，請由維護者完成接入。');
    const currentGeneration=++generation;
    const data=await api('catalog.list',{kind:type}); if(currentGeneration!==generation)return;
    if(!Array.isArray(data))throw Error('無法讀取內容資料。');
    if(type==='memory'){rows=data;renderMemories();}
    else if(type==='concert'){rows=data;renderConcerts();$('concert-new').hidden=!editable();}
    else {
      const record=data.find(r=>r.entry_id==='main'); const box=$('biography-content');box.replaceChildren();
      if(!record){box.append(node('p','尚未匯入大呂生平，請由維護者完成初始化。'));return;}
      box.append(node('p',record.document.biography),node('p',record.document.biographyMore));
      for(const career of record.document.career){const row=node('article');row.append(node('h3',career.label+' · '+career.title),node('p',career.description));box.append(row);}
      if(editable())box.prepend(button('編輯大呂生平',()=>openEditor(record,'biography')));
      box.append(button('版本紀錄',()=>history(record,'biography')));
    }
  }
  function choose(type){
    generation++; $('catalog-history').hidden=true;
    for(const [name,id] of [['submissions','submissions-panel'],['memory','memory-panel'],['concert','concert-panel'],['biography','biography-panel']]){
      $(id).hidden=name!==type; $('section-'+name).setAttribute('aria-pressed',String(name===type));
    }
    if(type!=='submissions')return load(type);
  }
  function renderMemories(){
    const results=$('memory-results');results.replaceChildren();
    const query=$('memory-query').value.trim().toLowerCase(),filter=$('memory-filter').value;
    const selected=rows.filter(r=>JSON.stringify([r.entry_id,r.document.n,r.document.story,r.document.y,r.document.sourceName,r.document.sourceNote]).toLowerCase().includes(query)&&(filter==='all'||(filter==='deleted')===!!r.deleted_at));
    $('memory-count').textContent=`${selected.length} 筆既有回憶。`;
    for(const record of selected){
      const doc=record.document,item=node('article');item.append(node('h3',doc.n),node('p',`${doc.y||'年份待核對'} · ${record.deleted_at?'已下架':'公開中'} · 編號 ${record.entry_id}`),node('p',doc.story),node('p',doc.sourceName||''),node('p',doc.sourceNote||''));
      if(doc.source){const link=node('a','原始資料來源');link.href=doc.source;link.target='_blank';link.rel='noopener noreferrer';item.append(link);}
      item.append(node('p',doc.type==='text'?'文字資料':`原有${doc.type==='video'?'影片':'照片'} · 素材 ${doc.asset}（來源權利仍需內容負責人確認）`));
      const asset=doc.type!=='text'&&memoryAssets.get(doc.asset);
      if(asset){
        const url='/handoff-v1.1/'+encodeURIComponent('工程檔')+'/'+asset.path;
        const image=node('img');image.src=url;image.alt=doc.n;image.loading='lazy';image.width=200;image.style.maxWidth='100%';image.style.height='auto';item.append(image);
        const download=node('a',doc.type==='video'?'下載既有影片預覽圖':'下載既有照片');download.href=url;download.download=asset.path.split('/').pop();item.append(download);
      }
      if(doc.type==='video'&&(doc.youtube||doc.externalVideo)){const video=node('a','開啟原始影片');video.href=doc.youtube?'https://www.youtube.com/watch?v='+doc.youtube:doc.externalVideo;video.target='_blank';video.rel='noopener noreferrer';item.append(video);}
      const actions=node('div');actions.className='actions';
      if(editable())actions.append(button('編輯',()=>openEditor(record,'memory')),button(record.deleted_at?'恢復公開':'下架',async()=>{
        if(!confirm(record.deleted_at?'恢復這則既有回憶公開？':'下架這則既有回憶？原文與版本仍保留。'))return;
        await api('catalog.visibility',{kind:'memory',id:record.entry_id,revision:record.revision,deleted:!record.deleted_at});await load('memory');
      }));
      actions.append(button('版本紀錄',()=>history(record,'memory')));item.append(actions);results.append(item);
    }
    if(!selected.length)results.append(node('p','沒有符合條件的既有回憶。'));
    $('memory-export').hidden=!['system_admin','data_curator'].includes(getRole());
  }
  for(const type of ['submissions','memory','concert','biography'])$('section-'+type).onclick=()=>task(()=>choose(type));
  $('memory-search').onsubmit=event=>{event.preventDefault();renderMemories();};
  $('memory-reload').onclick=()=>task(()=>load('memory'));
  $('memory-export').onclick=()=>{
    if(!['system_admin','data_curator'].includes(getRole()))return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(rows,null,2)],{type:'application/json'}));
    const link=node('a');link.href=url;link.download='existing-memories.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('concert-search').onsubmit=event=>{event.preventDefault();renderConcerts();};
  $('concert-reload').onclick=()=>task(()=>load('concert'));
  $('biography-reload').onclick=()=>task(()=>load('biography'));
  $('concert-new').onclick=()=>{ const id=Date.now(); openEditor({entry_id:String(id),revision:0,document:{id,title:'',date:'',year:new Date().getFullYear(),ens:'',place:'',cond:'',story:'',source:'',sourceName:'',asset:'lu-portrait',imageLabel:'呂彥慶指揮資料照（非該場演出照片）',rows:[],need:true}},'concert'); };
  $('catalog-edit-dialog').addEventListener('cancel',()=>{editGeneration++});
  return { enter(){choose('submissions');},clear(){generation++;editGeneration++;rows=[];for(const id of ['memory-results','concert-results','biography-content','catalog-history'])$(id).replaceChildren();$('catalog-edit-dialog').close();$('catalog-edit-form').replaceChildren();} };
}
