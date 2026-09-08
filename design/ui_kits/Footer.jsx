function Footer({go}){
  const cols=[['Séjours',['Hébergements','Salles et cuisine','Tentes et hamacs','Tarifs','Disponibilités']],['Aux 4 Sources',['Mariages champêtres','Anniversaires','En famille ou entre amis','Retraites scolaires','Mises au vert','Teams building']],['Découvrir',['Agenda','Activités','Nos projets','Le Bar des 4 Sources']],['À propos',['Raison d\'être','Nous soutenir','Accès et adresse','Contact']]];
  return <footer style={{background:'var(--c-teal)',color:'#fff',padding:'56px 24px 32px'}}>
    <div style={{maxWidth:'var(--container)',margin:'0 auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr repeat(4,1fr)',gap:32}}>
        <div><img src={A+'logo/logo-white.png'} alt="Les 4 Sources" style={{height:120,marginLeft:-12}}/><div style={{display:'flex',gap:10,marginTop:12,alignItems:'center'}}>{['convivialite','hebergement','nature','artisanat','vie-collective','ressourcement','production'].map(p=><img key={p} src={A+'icons/poles/pole-'+p+'-white.svg'} style={{height:28}}/>)}</div><div style={{font:'var(--text-ui)',fontSize:13,marginTop:16,opacity:.9,lineHeight:1.6}}>Fonds d’Ahinvaux 1, 5530 Yvoir<br/>contact@les4sources.be<br/>+32 490 46 77 10 <span style={{background:'var(--c-accueil)',padding:'2px 6px',borderRadius:4,font:'var(--text-ui-bold)',fontSize:11}}>pour les réservations uniquement</span></div></div>
        {cols.map(([h,ls])=><div key={h}><div style={{font:'var(--text-overline)',letterSpacing:'.08em',textTransform:'uppercase',opacity:.7,marginBottom:14}}>{h}</div><div style={{display:'grid',gap:8}}>{ls.map(l=><a key={l} href="#" onClick={e=>{e.preventDefault();go(l==='Agenda'?'agenda':l.startsWith('Le Bar')?'bar':/Héberg|Salles|Tentes|Tarifs|Dispon/.test(l)?'sejours':'home');}} style={{color:'#fff',textDecoration:'none',font:'var(--text-ui)',fontWeight:400}}>{l}</a>)}</div></div>)}
      </div>
      <div style={{borderTop:'1px solid rgba(255,255,255,.2)',marginTop:40,paddingTop:20,display:'flex',justifyContent:'space-between',font:'var(--text-caption)',opacity:.75}}><span>Ce site web et nos photos sont sous license Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License</span><span>Facebook</span></div>
    </div>
  </footer>;
}
window.Footer=Footer;
