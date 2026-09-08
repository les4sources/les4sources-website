import React from 'react';
const V = {
  primary:{bg:'var(--accent)',fg:'#fff',bd:'var(--accent)',hbg:'var(--accent-hover)',abg:'var(--accent-active)'},
  secondary:{bg:'transparent',fg:'var(--c-teal)',bd:'var(--c-teal)',hbg:'var(--c-surface)',abg:'var(--c-line-soft)'},
  ghost:{bg:'transparent',fg:'var(--c-teal)',bd:'transparent',hbg:'var(--c-surface)',abg:'var(--c-line-soft)'},
  highlight:{bg:'var(--c-socioculturel)',fg:'var(--c-teal)',bd:'var(--c-socioculturel)',hbg:'#f2cc2a',abg:'#d9b40a'},
  pole:{bg:'var(--pole,var(--c-accueil))',fg:'#fff',bd:'var(--pole,var(--c-accueil))',hbg:'var(--pole,var(--c-accueil))',abg:'var(--pole,var(--c-accueil))'},
};
const S = {sm:{h:'var(--control-h-sm)',px:14,fs:13},md:{h:'var(--control-h-md)',px:20,fs:15},lg:{h:'var(--control-h-lg)',px:26,fs:16}};
export function Button({variant='primary',size='md',pole,disabled=false,fullWidth=false,leading,trailing,children,style,onClick,type='button',href,...rest}){
  const v=V[variant]||V.primary, s=S[size]||S.md;
  const [st,setSt]=React.useState('idle');
  const bg = st==='active'?v.abg: st==='hover'?v.hbg: v.bg;
  const base={display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,height:s.h,padding:'0 '+s.px+'px',borderRadius:'var(--radius-pill)',border:'var(--border-w) solid '+v.bd,background:bg,color:v.fg,font:'var(--text-ui-bold)',fontSize:s.fs,letterSpacing:'.01em',cursor:disabled?'not-allowed':'pointer',opacity:disabled?.45:1,width:fullWidth?'100%':undefined,textDecoration:'none',transition:'background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease)',whiteSpace:'nowrap',filter:variant==='pole'&&st!=='idle'?'brightness(.92)':undefined,...(pole?{'--pole':'var(--c-'+pole+')'}:{}),...style};
  const ev={onMouseEnter:()=>setSt('hover'),onMouseLeave:()=>setSt('idle'),onMouseDown:()=>setSt('active'),onMouseUp:()=>setSt('hover')};
  const Tag=href?'a':'button';
  return <Tag {...(href?{href}:{type,disabled})} onClick={disabled?undefined:onClick} style={base} {...ev} {...rest}>{leading}{children}{trailing}</Tag>;
}
