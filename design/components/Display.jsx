import React from 'react';

// Badge — uppercase overline pill
export function Badge({tone='neutral',size='md',children,style}){
  const t={neutral:{bg:'var(--c-surface)',fg:'var(--text-primary)'},teal:{bg:'var(--c-teal)',fg:'#fff'},success:{bg:'var(--status-success-bg)',fg:'var(--status-success)'},warning:{bg:'var(--status-warning-bg)',fg:'var(--status-warning)'},danger:{bg:'var(--status-danger-bg)',fg:'var(--status-danger)'},highlight:{bg:'var(--c-socioculturel)',fg:'var(--c-teal)'}}[tone];
  return <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:size==='sm'?'2px 8px':'4px 10px',borderRadius:'var(--radius-pill)',background:t.bg,color:t.fg,font:'var(--text-overline)',fontSize:size==='sm'?11:12,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap',...style}}>{children}</span>;
}

// Tag — selectable filter pill
export function Tag({selected=false,onClick,onRemove,children,style}){
  const [h,setH]=React.useState(false);
  return <span onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{display:'inline-flex',alignItems:'center',gap:6,height:32,padding:'0 12px',borderRadius:'var(--radius-pill)',border:'var(--border-w) solid '+(selected?'var(--c-teal)':'var(--border-default)'),background:selected?'var(--c-teal)':h&&onClick?'var(--c-surface)':'#fff',color:selected?'#fff':'var(--text-primary)',font:'var(--text-ui)',cursor:onClick?'pointer':'default',transition:'background var(--dur-fast) var(--ease)',...style}}>
    {children}{onRemove&&<button type="button" aria-label="Retirer" onClick={e=>{e.stopPropagation();onRemove();}} style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',padding:0,display:'grid',placeItems:'center',marginRight:-4}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>}
  </span>;
}

// PoleTag — category tag tinted by pôle
export const POLES={
  accueil:{label:'Accueil',cat:'Hébergement',picto:'hebergement'},
  microferme:{label:'Micro-ferme',cat:'Production',picto:'production'},
  artisanat:{label:'Artisanat',cat:'Artisanat',picto:'artisanat'},
  socioculturel:{label:'Socioculturel',cat:'Liens et convivialité',picto:'convivialite'},
  nature:{label:'Nature',cat:'Nature',picto:'nature'},
  ressourcement:{label:'Ressourcement',cat:'Ressourcement',picto:'ressourcement'},
  'vie-collective':{label:'Vie collective',cat:'Vie collective',picto:'vie-collective'},
};
const LIGHT=['artisanat','socioculturel','ressourcement'];
export function PoleTag({pole='accueil',children,solid=false,picto=false,pictoBase,style}){
  const c='var(--c-'+pole+')', ink='var(--c-'+pole+'-ink)', tint='var(--c-'+pole+'-tint)';
  const p=POLES[pole]||POLES.accueil;
  const src=picto?(pictoBase||'assets/icons/poles/')+'pole-'+p.picto+(solid?'-white':'')+'.svg':null;
  return <span style={{display:'inline-flex',alignItems:'center',gap:8,padding:'4px 12px 4px 8px',borderRadius:'var(--radius-pill)',background:solid?c:tint,color:solid?(LIGHT.includes(pole)?'var(--c-teal)':'#fff'):ink,font:'var(--text-ui-bold)',fontSize:13,whiteSpace:'nowrap',...style}}>
    {src?<img src={src} alt="" style={{height:16,width:'auto'}}/>:<span style={{width:10,height:10,borderRadius:'50%',background:solid?'currentColor':c,flex:'none'}}/>}{children||p.cat}
  </span>;
}

// Highlight — marker slab behind text
export function Highlight({color='var(--c-socioculturel)',thickness=.4,children,style}){
  const top=Math.round((1-thickness)*100-5), bottom=92;
  return <span style={{background:'linear-gradient(transparent '+top+'%,'+color+' '+top+'%,'+color+' '+bottom+'%,transparent '+bottom+'%)',padding:'0 .12em',boxDecorationBreak:'clone',WebkitBoxDecorationBreak:'clone',...style}}>{children}</span>;
}

// Tabs — yellow underline
export function Tabs({items=[],value,defaultValue,onChange,style}){
  const [i,setI]=React.useState(defaultValue??(items[0]&&(items[0].value??items[0])));
  const v=value??i;
  return <div role="tablist" style={{display:'flex',gap:4,borderBottom:'var(--border-w) solid var(--border-default)',...style}}>
    {items.map(it=>{const tv=it.value??it; const tl=it.label??it; const on=tv===v;
      return <button key={tv} role="tab" aria-selected={on} type="button" onClick={()=>{setI(tv);onChange&&onChange(tv);}} style={{border:0,background:'transparent',padding:'10px 14px',marginBottom:-1.5,font:on?'var(--text-ui-bold)':'var(--text-ui)',color:on?'var(--c-teal)':'var(--text-secondary)',borderBottom:'3px solid '+(on?'var(--c-socioculturel)':'transparent'),cursor:'pointer',transition:'color var(--dur-fast) var(--ease)'}}>{tl}</button>;})}
  </div>;
}
