import React from 'react';
import {PoleTag, Badge} from './Display.jsx';

// Card — flat rounded surface, optional photo header, hover lift
export function Card({image,imageAlt='',imageAspect='4/3',surface='white',padding=20,hoverable=false,onClick,children,style}){
  const [h,setH]=React.useState(false);
  const bg={white:'#fff',paper:'var(--surface-paper)',subtle:'var(--surface-subtle)',teal:'var(--c-teal)'}[surface];
  return <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:bg,color:surface==='teal'?'#fff':'var(--text-primary)',borderRadius:'var(--radius-photo)',overflow:'hidden',border:surface==='white'?'var(--border-w) solid var(--border-soft)':'none',boxShadow:hoverable&&h?'var(--shadow-md)':'none',transform:hoverable&&h?'translateY(-2px)':'none',transition:'box-shadow var(--dur-base) var(--ease),transform var(--dur-base) var(--ease)',cursor:onClick?'pointer':'default',...style}}>
    {image&&<img src={image} alt={imageAlt} style={{display:'block',width:'100%',aspectRatio:imageAspect,objectFit:'cover'}}/>}
    <div style={{padding}}>{children}</div>
  </div>;
}

// EventCard — Card + PoleTag + sold-out badge + title + date
export function EventCard({title,date,pole='socioculturel',image,soldOut=false,href,onClick,style}){
  return <Card image={image} imageAlt={title} hoverable onClick={onClick} style={style}>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}><PoleTag pole={pole}/>{soldOut&&<Badge tone="danger">Complet !</Badge>}</div>
    <h4 style={{font:'var(--text-h4)',marginBottom:6}}>{href?<a href={href} style={{color:'inherit',textDecoration:'none'}}>{title}</a>:title}</h4>
    <div style={{font:'var(--text-ui)',color:'var(--text-secondary)'}}>{date}</div>
  </Card>;
}

// BlobPanel — photo with a flat pôle-colour panel whose edge is a soft blob; title in Averia Bold inside.
// One pôle colour per cover. Titles break onto 2–5 short lines.
export function BlobPanel({image,imageAlt='',pole='microferme',width='42%',height=420,radius='var(--radius-photo)',align='left',children,style}){
  const c='var(--c-'+pole+')';
  const clip=align==='left'?'ellipse(100% 78% at 0% 50%)':'ellipse(100% 78% at 100% 50%)';
  return <div style={{position:'relative',height,borderRadius:radius,overflow:'hidden',background:'var(--c-surface)',...style}}>
    {image&&<img src={image} alt={imageAlt} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>}
    <div style={{position:'absolute',top:0,bottom:0,[align]:0,width,background:c,clipPath:clip,display:'flex',alignItems:'center',justifyContent:align==='left'?'flex-start':'flex-end',padding:align==='left'?'32px 22% 32px 40px':'32px 40px 32px 22%'}}>
      <div style={{color:pole==='accueil'?'#fff':'var(--c-teal)',font:'var(--text-h2)',textAlign:align==='left'?'left':'right'}}>{children}</div>
    </div>
  </div>;
}
