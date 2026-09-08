function Home({go}){
  const {Button,EventCard,Card,Highlight,Input}=window['Les4SourcesDesignSystem_553205'];
  const events=[
    {t:'⚡ COMPLET ! Initiation à la soudure à l’arc',d:'samedi 12 septembre',p:'artisanat',so:true,img:A+'images/event-low-tech.jpg'},
    {t:'🍕 Pizza Party de septembre !',d:'vendredi 18 septembre',p:'socioculturel',img:A+'images/event-pizza-party.jpg'},
    {t:'🪓 Créer un objet en bois de palette',d:'samedi 3 octobre',p:'artisanat'},
    {t:'🌻 Plantes Papier Pigments',d:'samedi 3 octobre',p:'artisanat'},
  ];
  return <main>
    <div style={{position:'relative',height:560,overflow:'hidden'}}>
      <img src={A+'images/drone-clairiere.avif'} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>
      <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',background:'#fff',borderRadius:'48% 52% 50% 50% / 55% 55% 45% 45%',padding:'56px 96px',textAlign:'center',minWidth:560}}>
        <img src={A+'logo/mark-teal.svg'} alt="" style={{height:64,marginBottom:12}}/>
        <h1 style={{font:'var(--text-h1)',fontSize:56,textTransform:'uppercase',letterSpacing:'.02em'}}>Les 4 Sources</h1>
        <div style={{font:'var(--text-h3)',color:'var(--text-secondary)',marginTop:8}}>Tiers-lieu dans la clairière<br/>entre Namur et Dinant</div>
      </div>
    </div>
    <Section>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:40}}>
        <div><h2 style={{font:'var(--text-h2)',marginBottom:12}}>Lieu d’activités</h2><p style={{font:'var(--text-body)'}}>Un lieu où vivre des expériences innovantes et inspirantes en famille, entre ami·e·s ou entre collègues.</p><p style={{font:'var(--text-body)',marginTop:10}}>Nos <a href="#" onClick={e=>{e.preventDefault();go('sejours');}}>hébergements et salles</a>, <a href="#">activités</a> et <a href="#" onClick={e=>{e.preventDefault();go('agenda');}}>événements</a>.</p></div>
        <div><h2 style={{font:'var(--text-h2)',marginBottom:12}}>Lieu de nature</h2><p style={{font:'var(--text-body)'}}>Une clairière de 15 hectares où l’accueil de la biodiversité fait partie intégrante de l’ADN du projet.</p><p style={{marginTop:10}}><a href="#">La biodiversité aux 4 Sources</a></p></div>
        <div><h2 style={{font:'var(--text-h2)',marginBottom:12}}>Lieu de vie collective</h2><p style={{font:'var(--text-body)'}}>Un tiers-lieu sur lequel <a href="#">différents projets</a> se déploient et où 5 foyers sont installés.</p><p style={{marginTop:10}}>Découvre <a href="#">notre collectif</a></p></div>
      </div>
      <Card surface="paper" style={{marginTop:48}} padding="20px 28px"><div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}><span style={{fontSize:28}}>🗞️</span><p style={{font:'var(--text-body)',flex:1,minWidth:260}}>Pour être informé·e des prochains événements aux 4 Sources, <b>inscris-toi à notre newsletter mensuelle</b>.</p><div style={{display:'flex',gap:8,alignItems:'flex-end'}}><Input placeholder="toi@exemple.be" style={{width:240}}/><Button>Je m’inscris</Button></div></div></Card>
    </Section>
    <Section title="Prochainement aux 4 Sources ⛅" surface="subtle">
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:20}}>{events.map(e=><EventCard key={e.t} title={e.t} date={e.d} pole={e.p} soldOut={e.so} image={e.img} onClick={()=>go('agenda')}/>)}</div>
      <div style={{marginTop:28}}><Button variant="secondary" onClick={()=>go('agenda')}>Tout l’agenda</Button></div>
    </Section>
    <Section title="Hébergements, salles polyvalentes et cuisine professionnelle 🏡">
      <div style={{display:'grid',gridTemplateColumns:'1.1fr 1fr',gap:48,alignItems:'center'}}>
        <img src={A+'images/table-sous-le-tilleul.jpg'} alt="" style={{width:'100%',aspectRatio:'4/3',objectFit:'cover',borderRadius:'var(--radius-photo)',display:'block'}}/>
        <div><p style={{font:'var(--text-lead)',marginBottom:20}}>Nos nombreux espaces accueillent tes séjours et activités entre collègues, entre amis ou tout simplement en famille.</p>
          <ul style={{font:'var(--text-body)',paddingLeft:22,display:'grid',gap:8,margin:'0 0 24px'}}><li><b><a href="#">2 gites</a></b> pouvant accueillir jusqu’à 25 personnes</li><li><b><a href="#">une grande salle</a></b> pour 30 à 100 personnes</li><li><b><a href="#">une petite salle</a></b> pour 10 à 30 personnes</li><li>une <b><a href="#">cuisine professionnelle</a></b></li><li><b><a href="#">un bivouac</a></b> pour tentes et hamacs</li></ul>
          <Button onClick={()=>go('sejours')}>Toutes nos locations</Button></div>
      </div>
    </Section>
    <Section surface="paper">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:48,alignItems:'center'}}>
        <div><h2 style={{font:'var(--text-h2)',marginBottom:16}}>La Guinguette des 4 Sources 🍹</h2><p style={{font:'var(--text-body)'}}><b>WOW, nous avons récolté près de 20.000€ grâce à plus de 115 donatrices et donateurs !</b> Merci de nous avoir soutenu, maintenant à nous de jouer pour sublimer la terrasse 🙂</p><p style={{font:'var(--text-body)',margin:'10px 0 22px'}}>Et, et et… Saviez-vous qu’il était toujours possible de nous soutenir ?</p><Button variant="highlight">💌 Nous soutenir</Button></div>
        <img src={A+'images/pizza-party-terrasse.jpg'} alt="" style={{width:'100%',aspectRatio:'16/10',objectFit:'cover',borderRadius:'var(--radius-photo)',display:'block'}}/>
      </div>
    </Section>
    <Section title="Nos projets 🎴">
      <Lead style={{marginBottom:28}}>Aux 4 Sources émergent des projets plein de sens aux valeurs partagées.</Lead>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
        {[['Semisto','Un collectif au service de celles et ceux qui rêvent de jardins-forêts : bureau d’études, formations et pépinière-école'],['De Branches en Planches','Magnifier n’importe quel morceau de bois pour faire du beau, de l’utile et du durable'],['Tranches de Vie','De délicieux pains au levain cuits au feu de bois tous les vendredis']].map(([t,d])=><Card key={t} hoverable>{t==='De Branches en Planches'?<img src={A+'images/atelier-bois.jpg'} alt="" style={{width:'100%',aspectRatio:'16/10',objectFit:'cover',borderRadius:8,display:'block',marginBottom:16}}/>:<Placeholder label={t} ratio="16/10" style={{marginBottom:16}}/>}<h3 style={{font:'var(--text-h4)',marginBottom:8}}><a href="#" style={{textDecoration:'none'}}>{t}</a></h3><p style={{font:'var(--text-small)',color:'var(--text-secondary)'}}>{d}</p></Card>)}
      </div>
      <div style={{marginTop:28}}><Button variant="secondary">Tous les projets</Button></div>
    </Section>
    <Section surface="teal">
      <h2 style={{font:'var(--text-h2)',color:'#fff',marginBottom:32}}>Randonneur ou cycliste de passage ? 🚵🏻</h2>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:40}}>
        <div><h3 style={{font:'var(--text-h3)',fontWeight:700,color:'#fff',marginBottom:10}}><Highlight>Le Bar des 4 Sources</Highlight></h3><p style={{font:'var(--text-body)',color:'#fff',opacity:.92}}>Le bar des 4 Sources accueille les marcheur·euse·s et cyclistes du lever au coucher du soleil, ainsi que toutes les personnes de passage sur le lieu pour une activité ou une location.</p><div style={{marginTop:20}}><Button variant="highlight" onClick={()=>go('bar')}>Voir la carte du bar</Button></div></div>
        <div><h3 style={{font:'var(--text-h3)',fontWeight:700,color:'#fff',marginBottom:10}}>Carte de balades</h3><p style={{font:'var(--text-body)',color:'#fff',opacity:.92}}>Télécharge notre carte de randonnées au départ des 4 Sources, avec des balades et randos adaptées aux familles et aux aventuriers.</p><div style={{marginTop:20}}><Button variant="secondary" style={{color:'#fff',borderColor:'#fff'}}>🥾 Télécharger la carte</Button></div></div>
      </div>
    </Section>
    <Section title="Nos activités pour groupes 👥">
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:48}}>
        <div><h3 style={{font:'var(--text-h4)',marginBottom:10}}>🍕 <a href="#">Une Pizza Party pour ton groupe ?</a></h3><p style={{font:'var(--text-body)'}}>C’est possible le mardi soir et le vendredi soir aux 4 Sources ! Par temps plus frais, couplez votre Pizza Party privée avec la location de notre petite salle !</p><p style={{font:'var(--text-body)',marginTop:10}}>Révise ton italien et viens chanter Eros Ramazzotti en cuisant de délicieuses pizzas avec tes amis ou ta famille dans notre four à bois.</p><p style={{marginTop:10}}><a href="#">Existe aussi en Camembert Party !</a></p></div>
        <div><p style={{font:'var(--text-body)',marginBottom:12}}>Nous te proposons <b>une série d’activités passionnantes</b> pour tes…</p><div style={{display:'grid',gap:8,font:'var(--text-body)'}}>{['Retraites scolaires','Mariages','Mises au vert (associations et entreprises)','Team buildings','Week-ends familiaux et entre amis','Coworking'].map(l=><div key={l}>✔️ <a href="#">{l}</a></div>)}</div><div style={{marginTop:22}}><Button variant="secondary">Tout le catalogue d’ateliers pour groupes</Button></div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20,marginTop:40}}>{[['Bain d’ânes',null],['Grimpe encadrée dans les arbres','grimpe-arbres.jpg'],['Initiation au Disc-golf',null]].map(([t,img])=><div key={t}>{img?<img src={A+'images/'+img} alt="" style={{width:'100%',aspectRatio:'4/3',objectFit:'cover',borderRadius:'var(--radius-photo)',display:'block',marginBottom:10}}/>:<Placeholder label={t} style={{marginBottom:10}}/>}<div style={{font:'var(--text-h4)'}}>{t}</div></div>)}</div>
    </Section>
  </main>;
}
window.Home=Home;
