(() => {
  "use strict";
  const KEY = "dalu-memorial-theme-v1";
  const PRESETS = [
    {id:"auto",name:"跟隨系統",bg:"#F7F5F0",accent:"#C7A56B"},
    {id:"original",name:"典藏紙色",bg:"#F7F5F0",accent:"#C7A56B"},
    {id:"ivory",name:"象牙年鑑",bg:"#FAF4E2",accent:"#C69047"},
    {id:"night",name:"夜空展廳",bg:"#101B2B",accent:"#E3B56D"},
    {id:"score",name:"樂譜長卷",bg:"#F0E9DD",accent:"#B28C54"}
  ];
  const root=document.documentElement;
  const defaultAccent=id=>PRESETS.find(p=>p.id===id)?.accent||"#C7A56B";
  const validHex=v=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v);
  let saved={mode:"auto",custom:null};
  try {
    const data=JSON.parse(localStorage.getItem(KEY)||"null");
    if(data&&PRESETS.some(p=>p.id===data.mode)){
      saved.mode=data.mode;
      if(validHex(data.custom)) saved.custom=data.custom;
    }
  } catch {}
  const system=window.matchMedia?.("(prefers-color-scheme: dark)");
  const lum=hex=>{
    const ch=[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*ch[0]+.7152*ch[1]+.0722*ch[2];
  };
  const accentContrast=(accent,dark)=> {
    const l=lum(accent);
    if(dark) return l>.56?"#172438":accent;
    return l<.28?accent:"#5A390B";
  };
  function apply(){
    const mode=saved.mode==="auto"?(system?.matches?"night":"original"):saved.mode;
    root.dataset.palette=mode;
    // The existing prototype supports data-theme="light"/"dark"; synchronize it to
    // avoid the automatic dark CSS overriding manually selected light palettes.
    root.dataset.theme=mode==="night"?"dark":"light";
    const accent=saved.custom||defaultAccent(mode);
    root.style.setProperty("--accent",accent);
    root.style.setProperty("--accent-text",accentContrast(accent,mode==="night"));
    // These legacy variables power highlights, headlines and buttons site-wide.
    root.style.setProperty("--gold",accent);
    root.style.setProperty("--gold-text",accentContrast(accent,mode==="night"));
    root.style.setProperty("--theme-panel",getComputedStyle(root).getPropertyValue("--surface"));
    root.style.setProperty("--theme-panel-ink",getComputedStyle(root).getPropertyValue("--ink"));
    root.style.colorScheme=mode==="night"?"dark":"light";
    document.querySelectorAll("[data-preset]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.preset===saved.mode)));
    const input=document.getElementById("accentCustom");
    if(input)input.value=accent;
    const label=document.getElementById("themeLabel");
    if(label)label.textContent=PRESETS.find(p=>p.id===saved.mode)?.name||"配色";
  }
  function store(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}}
  function init(){
    const trigger=document.getElementById("themeTrigger");
    const panel=document.getElementById("themePanel");
    if(!trigger||!panel)return;
    const holder=panel.querySelector(".theme-options");
    holder.innerHTML=PRESETS.map(p=>`<button class="theme-option" type="button" data-preset="${p.id}" aria-pressed="false"><span aria-hidden="true" class="swatch" style="--sw1:${p.bg};--sw2:${p.accent}"></span><span>${p.name}</span></button>`).join("");
    function setOpen(open){panel.hidden=!open;trigger.setAttribute("aria-expanded",String(open));if(open)panel.querySelector(".theme-option[aria-pressed=true]")?.focus();}
    trigger.addEventListener("click",()=>setOpen(panel.hidden));
    holder.addEventListener("click",e=>{
      const b=e.target.closest("[data-preset]");if(!b)return;
      saved.mode=b.dataset.preset;saved.custom=null;store();apply();
    });
    document.getElementById("accentCustom").addEventListener("input",e=>{
      if(!validHex(e.target.value))return;
      saved.custom=e.target.value;store();apply();
    });
    document.getElementById("themeReset").addEventListener("click",()=>{
      saved={mode:"auto",custom:null};store();apply();
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden){setOpen(false);trigger.focus()}});
    document.addEventListener("click",e=>{if(!panel.hidden&&!panel.contains(e.target)&&!trigger.contains(e.target))setOpen(false)});
    apply();
  }
  apply();
  system?.addEventListener?.("change",()=>{if(saved.mode==="auto")apply()});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
