const A='../../assets/';
function Section({title,children,surface,narrow,style}){
  return <section style={{background:surface==='paper'?'var(--surface-paper)':surface==='teal'?'var(--c-teal)':surface==='subtle'?'var(--surface-subtle)':'transparent',color:surface==='teal'?'#fff':'inherit',padding:'64px 24px',...style}}>
    <div style={{maxWidth:narrow?'var(--container-narrow)':'var(--container)',margin:'0 auto'}}>
      {title&&<h2 style={{font:'var(--text-h2)',color:surface==='teal'?'#fff':'var(--text-primary)',marginBottom:28}}>{title}</h2>}
      {children}
    </div>
  </section>;
}
function Placeholder({label='Photo',ratio='4/3',radius='var(--radius-photo)',style}){
  return <div style={{aspectRatio:ratio,borderRadius:radius,background:'repeating-linear-gradient(135deg,var(--c-surface) 0 12px,var(--c-line-soft) 12px 24px)',display:'grid',placeItems:'center',font:'var(--text-caption)',color:'var(--text-muted)',...style}}>{label}</div>;
}
function Lead({children,style}){return <p style={{font:'var(--text-lead)',color:'var(--text-secondary)',maxWidth:640,...style}}>{children}</p>;}
Object.assign(window,{A,Section,Placeholder,Lead});
