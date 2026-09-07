function Sejours({go}){
  const NS=window['Les4SourcesDesignSystem_553205']; const {Button,Card,PoleTag,Badge,Dialog,Input,Select,Radio,Toast}=NS; const BounceSidebar=NS.BounceSidebar||(()=>null);
  const ids={'Hébergements':'hebergements','Salles et cuisine':'salles','Tentes et hamacs':'bivouac'};
  const [open,setOpen]=React.useState(false); const [sent,setSent]=React.useState(false);
  const items={
    'Hébergements':[['Le grand gîte','Jusqu’à 18 personnes, cuisine équipée, poêle à bois.'],['Le petit gîte','Jusqu’à 7 personnes, plain-pied, vue sur la clairière.']],
    'Salles et cuisine':[['La grande salle','Pour 30 à 100 personnes, accès direct à la terrasse.'],['La petite salle','Pour 10 à 30 personnes, idéale pour les ateliers.'],['La cuisine professionnelle','Pour cuisiner en groupe ou avec ton traiteur.']],
    'Tentes et hamacs':[['Le bivouac','Emplacements pour tentes et hamacs, feu de camp autorisé, sanitaires à 50 m.']],
  };
  return <main>
    <Section narrow style={{paddingBottom:24}}><PoleTag pole="accueil" style={{marginBottom:16}}>Séjours et locations</PoleTag><h1 style={{font:'var(--text-h1)',marginBottom:12}}>Séjours aux 4 Sources 🏡</h1><Lead>Nos nombreux espaces accueillent tes séjours et activités entre collègues, entre amis ou tout simplement en famille.</Lead></Section>
    <Section style={{paddingTop:0}}>
      <div style={{display:'grid',gridTemplateColumns:'220px minmax(0,1fr)',gap:48,alignItems:'start'}}>
        <div style={{position:'sticky',top:96}}><BounceSidebar title="Sommaire" scrollSpy offset={110} items={[{label:'Espaces',heading:true},...Object.keys(items).map(k=>({label:k,href:'#'+ids[k]})),{label:'Pratique',heading:true},{label:'Tarifs',href:'#tarifs'},{label:'Disponibilités',href:'#dispo'}]}/></div>
        <div style={{display:'grid',gap:64}}>
          {Object.keys(items).map(k=><section key={k} id={ids[k]}><h2 style={{font:'var(--text-h2)',marginBottom:20}}>{k}</h2><div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:24}}>{items[k].map(([t,d])=><Card key={t} hoverable>{t==='Le bivouac'?<img src={A+'images/drone-hiver.jpg'} alt="" style={{width:'100%',aspectRatio:'16/9',objectFit:'cover',borderRadius:8,display:'block',marginBottom:16}}/>:t==='La grande salle'?<img src={A+'images/drone-clairiere.avif'} alt="" style={{width:'100%',aspectRatio:'16/9',objectFit:'cover',borderRadius:8,display:'block',marginBottom:16}}/>:<Placeholder label={t} ratio="16/9" style={{marginBottom:16}}/>}<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}}><div><h3 style={{font:'var(--text-h4)',marginBottom:6}}>{t}</h3><p style={{font:'var(--text-small)',color:'var(--text-secondary)'}}>{d}</p></div><Badge tone="success">Disponible</Badge></div><div style={{marginTop:18,display:'flex',gap:10}}><Button size="sm" onClick={()=>setOpen(true)}>Demander une réservation</Button><Button size="sm" variant="ghost">Tarifs</Button></div></Card>)}</div></section>)}
          <section id="tarifs"><h2 style={{font:'var(--text-h2)',marginBottom:20}}>Tarifs</h2><Card surface="paper" padding={32}><p style={{font:'var(--text-body)'}}>Grille tarifaire du site — non recréée ici, voir les4sources.be/sejours.</p></Card></section>
          <section id="dispo"><h2 style={{font:'var(--text-h2)',marginBottom:20}}>Disponibilités</h2><Card surface="paper" padding={32}><p style={{font:'var(--text-body)'}}>Calendrier de disponibilités du site — non recréé ici, voir les4sources.be/sejours.</p></Card></section>
        </div>
      </div>
    </Section>
    <Dialog open={open} title="Demande de réservation" onClose={()=>setOpen(false)} footer={<><Button variant="ghost" onClick={()=>setOpen(false)}>Annuler</Button><Button onClick={()=>{setOpen(false);setSent(true);setTimeout(()=>setSent(false),4000);}}>Envoyer la demande</Button></>}>
      <div style={{display:'grid',gap:16}}><Input label="Ton nom" placeholder="Prénom Nom"/><Input label="Adresse e-mail" placeholder="toi@exemple.be"/><Select label="Espace souhaité" options={['Le grand gîte','Le petit gîte','La grande salle','La petite salle','Le bivouac']}/><Radio name="type" options={['En famille ou entre amis','Groupe / association','Entreprise']} defaultValue="En famille ou entre amis"/></div>
    </Dialog>
    {sent&&<div style={{position:'fixed',right:24,bottom:24,zIndex:60}}><Toast tone="success" title="Demande envoyée" onClose={()=>setSent(false)}>On te répond dans les 48 h. À bientôt aux 4 Sources !</Toast></div>}
  </main>;
}
window.Sejours=Sejours;
