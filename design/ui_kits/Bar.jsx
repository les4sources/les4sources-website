function Bar({go}){
  const {Highlight,Badge,Card,Button}=window['Les4SourcesDesignSystem_553205'];
  const Bio=()=><span title="bio" style={{display:'inline-block',width:16,height:11,background:'var(--c-microferme)',borderRadius:2,marginRight:8,verticalAlign:'middle'}}/>;
  const Row=({n,p,bio,note})=><div style={{display:'flex',alignItems:'baseline',gap:12,font:'var(--text-ui-bold)',fontSize:17}}>{bio?<Bio/>:<span style={{width:24,display:'inline-block'}}/>}<span>{n}{note&&<i style={{font:'var(--text-caption)',fontStyle:'italic',marginLeft:8}}>{note}</i>}</span><span style={{flex:1,borderBottom:'1px dotted var(--c-line)'}}/><span style={{fontWeight:400}}>{p}</span></div>;
  const H=({children})=><h3 style={{font:'var(--text-h3)',margin:'24px 0 12px'}}>{children}</h3>;
  return <main>
    <Section narrow style={{paddingBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:20}}><img src={A+'logo/mark-teal.svg'} style={{height:72}} alt=""/><div><h1 style={{font:'var(--text-h1)'}}><Highlight>Au bar des 4 Sources</Highlight></h1><div style={{font:'var(--text-h3)',color:'var(--text-secondary)',marginTop:8}}>Bar pour clients autonomes</div></div></div>
      <Lead style={{marginTop:24}}>Le bar accueille les marcheur·euse·s et cyclistes du lever au coucher du soleil, ainsi que toutes les personnes de passage sur le lieu pour une activité ou une location. <Badge tone="highlight">Self-service</Badge></Lead>
    </Section>
    <Section narrow style={{paddingTop:0}}>
      <img src={A+'images/bar-enseigne.jpg'} alt="Enseigne du bar" style={{width:'100%',aspectRatio:'21/9',objectFit:'cover',borderRadius:'var(--radius-photo)',display:'block',marginBottom:40}}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:48}}>
        <div><H>Bières 🍻</H><div style={{display:'grid',gap:10}}>{[['Trottinette 0%','3,5 €',1],['Top Lesse','3 €',1],['Taras Boulba','3 €',1],['Chinette','3,5 €',1],['Moinette bio','4 €',1],['Holy IPA','4 €'],['Big Nose','4 €'],['Lupulus','4 €',1],['Badjawe Brune','4 €',1]].map(([n,p,b])=><Row key={n} n={n} p={p} bio={b}/>)}</div></div>
        <div><H>Softs 🧃</H><div style={{display:'grid',gap:10}}>{[['Bionina','3 €',1],['Kefir','3 €',1,'Eau Vertueuse'],['Kombucha','5 €',1],['Café','2 €',1],['Thé ou tisane','2 €'],['Eau pétillante','1 €'],['Eau fraiche','Gratuit']].map(([n,p,b,note])=><Row key={n} n={n} p={p} bio={b} note={note}/>)}<div style={{display:'flex',alignItems:'baseline',gap:12,font:'var(--text-ui-bold)',fontSize:17}}><span style={{width:24}}/><Highlight thickness={.5}>Sirop fait maison</Highlight><span style={{flex:1}}/><span style={{fontWeight:400}}>1,5 €</span></div></div>
          <H><Bio/>Vins bio 🍷</H><div style={{display:'grid',gap:10}}><Row n="Verre" p="3 €"/><Row n="Bouteille" p="15 €"/></div>
          <H>À grignoter 🍟</H><Row n="Chips reBEL" p="4 €" bio/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32,marginTop:48,alignItems:'end'}}>
        <div><h3 style={{font:'var(--text-h3)',fontWeight:700,marginBottom:12}}><Highlight>Jus de pommes 🍎 du verger des 4 Sources</Highlight></h3><div style={{display:'grid',gap:10}}><Row n="Verre" p="2 €"/><Row n="Bouteille 1L" p="4 €"/></div><p style={{font:'var(--text-ui-bold)',marginTop:24}}>Paiement en cash dans la caisse ou par virement<br/><span style={{color:'var(--text-muted)'}}>Payment by cash in the till or bank transfer</span></p><p style={{font:'var(--text-ui)',fontWeight:400,marginTop:8,lineHeight:1.6}}>Les 4 Sources<br/>BE72 5230 8060 1116<br/>Communication : "Bar"</p></div>
        <Card surface="white" style={{background:'var(--c-socioculturel)',border:0,transform:'rotate(2deg)'}} padding={28}><div style={{display:'grid',placeItems:'center',gap:16}}><Placeholder label="QR code" ratio="1/1" radius="8px" style={{width:150,background:'#fff'}}/><span style={{background:'#fff',color:'var(--c-teal)',font:'var(--text-ui-bold)',padding:'8px 14px',borderRadius:4,transform:'rotate(-4deg)',boxShadow:'var(--shadow-sm)'}}>Paie avec ton app bancaire</span></div></Card>
      </div>
    </Section>
  </main>;
}
window.Bar=Bar;
