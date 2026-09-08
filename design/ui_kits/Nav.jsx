function Nav({current,go}){
  const {Button}=window['Les4SourcesDesignSystem_553205'];
  const links=[['home','Agenda','agenda'],['sejours','Séjours','sejours'],['salles','Salles','sejours'],['activites','Activités','home'],['projets','Projets','home'],['apropos','À propos','home']];
  return <header style={{position:'sticky',top:0,zIndex:10,background:'rgba(255,255,255,.96)',borderBottom:'var(--border-w) solid var(--border-soft)'}}>
    <div style={{maxWidth:'var(--container)',margin:'0 auto',padding:'0 24px',height:72,display:'flex',alignItems:'center',gap:32}}>
      <a href="#" onClick={e=>{e.preventDefault();go('home');}} style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none'}}><img src={A+'logo/mark-teal.svg'} alt="" style={{height:36}}/><span style={{font:'var(--text-h4)',color:'var(--c-teal)'}}>Les 4 Sources</span></a>
      <nav style={{display:'flex',gap:6,marginLeft:'auto'}}>
        {links.map(([k,l,target])=>{const on=current===target&&(l==='Agenda'||l==='Séjours'); return <a key={k} href="#" onClick={e=>{e.preventDefault();go(target);}} style={{font:on?'var(--text-ui-bold)':'var(--text-ui)',color:'var(--c-teal)',textDecoration:'none',padding:'8px 12px',borderRadius:'var(--radius-pill)',background:on?'var(--c-surface)':'transparent'}}>{l}</a>;})}
      </nav>
      <Button size="sm" variant="highlight" onClick={()=>go('bar')}>Le bar 🧉</Button>
    </div>
  </header>;
}
window.Nav=Nav;
