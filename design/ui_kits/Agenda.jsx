function Agenda({go}){
  const {EventCard,Tag,Tabs}=window['Les4SourcesDesignSystem_553205'];
  const [filter,setFilter]=React.useState('Tous');
  const cats={'Artisanat':'artisanat','Liens et convivialité':'socioculturel','Ressourcement':'socioculturel','Formation':'microferme','Séjours':'accueil'};
  const events=[
    {t:'⚡ COMPLET ! Initiation à la soudure à l’arc',d:'samedi 12 septembre',c:'Artisanat',so:true,img:A+'images/atelier-metal.jpg'},
    {t:'🍕 Pizza Party de septembre !',d:'vendredi 18 septembre',c:'Liens et convivialité',img:A+'images/pizza-party-terrasse.jpg'},
    {t:'🪓 Créer un objet en bois de palette',d:'samedi 3 octobre',c:'Artisanat',img:A+'images/atelier-bois.jpg'},
    {t:'🌻 Plantes Papier Pigments',d:'samedi 3 octobre',c:'Ressourcement',img:A+'images/table-sous-le-tilleul.jpg'},
    {t:'🖋️ Atelier d’écriture',d:'samedi 3 octobre',c:'Formation'},
    {t:'Pizza Party d’octobre ! 🍕',d:'vendredi 9 octobre',c:'Liens et convivialité',img:A+'images/event-pizza-party.jpg'},
    {t:'⚡ COMPLET ! Initiation à la soudure à l’arc',d:'samedi 17 octobre',c:'Artisanat',so:true,img:A+'images/event-low-tech.jpg'},
    {t:'🌳 Initiation à la taille d’arbres et arbustes fruitiers',d:'samedi 7 novembre',c:'Formation',img:A+'images/event-taille-fruitiers.jpg'},
  ];
  const shown=events.filter(e=>filter==='Tous'||e.c===filter);
  return <main>
    <Section narrow style={{paddingBottom:24}}><h1 style={{font:'var(--text-h1)',marginBottom:12}}>L’agenda des 4 Sources 🗓️</h1><Lead>Pizza Parties, ateliers d’artisanat, formations et moments de ressourcement. Inscris-toi, les places partent vite !</Lead></Section>
    <Section style={{paddingTop:0}}>
      <Tabs items={['À venir','Passés','Chaque semaine']} style={{marginBottom:24}}/>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:32}}>{['Tous','Artisanat','Liens et convivialité','Ressourcement','Formation'].map(c=><Tag key={c} selected={filter===c} onClick={()=>setFilter(c)}>{c}</Tag>)}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24}}>{shown.map((e,i)=><EventCard key={i} title={e.t} date={e.d} pole={cats[e.c]} soldOut={e.so} image={e.img} href="#"/>)}</div>
    </Section>
  </main>;
}
window.Agenda=Agenda;
