import {BLUE_PALETTE,matrixGroups,fileCadence} from './review-model.js';
// Narrow adaptation of reference/app.js: independent loops, fixed flight
// destinations, sine easing, trailing square chips and a flash on landing.
const PALETTE=BLUE_PALETTE;
const ease=t=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,t))))/2;
export class WorkflowVisual {
  constructor(root,{reducedMotion=false,groups=matrixGroups()}={}) {
    this.groups=groups;this.profiles=groups.map(g=>fileCadence(null,g));this.root=root;this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    this.nodes=[...root.querySelectorAll('.agent-cell')];this.tracks=[...root.querySelectorAll('.bar-track')];
    this.fills=[...root.querySelectorAll('.bar-fill')];this.counts=[...root.querySelectorAll('.rule-count')];
    this.particles=[];this.loops=[];this.landings=[];this.next=groups.map((_,i)=>i*75);this.serial=groups.map(()=>0);
    this.clock=0;this.lastTime=null;this.running=false;this.progress=0;this.reducedMotion=reducedMotion;this.alive=true;this.frameId=0;
    this.values=[0,0,0,0];this.targets=[0,0,0,0];this.totals=[0,0,0,0];this.sourceKey='';this.sourceLines=[];this.logs=[];
    this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(root);
    this.onVisibility=()=>{this.lastTime=null;if(!document.hidden)this.wake();};document.addEventListener('visibilitychange',this.onVisibility);
    this.measure();this.paint();
  }
  measure(){
    const box=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=box.width*dpr;this.canvas.height=box.height*dpr;this.ctx?.setTransform(dpr,0,0,dpr,0,0);
    if(this.width!==box.width||this.height!==box.height)this.particles=[];
    this.width=box.width;this.height=box.height;
    const relative=n=>{const r=n.getBoundingClientRect();return{x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2,width:r.width};};
    this.points=this.nodes.map(relative);
    this.cellIndices=this.groups.map(g=>this.nodes.map((n,i)=>({n,i})).filter(({n})=>Number(n.dataset?.group)===g.index).map(({i})=>i));this.destinations=this.tracks.map(n=>{const r=relative(n);return{...r,x:r.x-r.width/2};});
    const panel=this.root.querySelector('.source-panel');this.sourcePoint=panel?relative(panel):null;
  }
  setSource(document,status='idle'){
    const key=(document?.id||'')+'\0'+(document?.text||'');
    this.root.querySelector('.source-state').textContent={running:'SCANNING',paused:'PAUSED',complete:'CHECKED',cancelled:'STOPPED',idle:'READY'}[status]||'READY';
    if(key===this.sourceKey)return;
    this.sourceKey=key;this.sourceStart=this.clock;this.profiles=this.groups.map(g=>fileCadence(document,g));this.next=this.groups.map((g,i)=>this.clock+i*65);
    this.root.querySelector('.source-name').textContent='review.worker.ts';
    const count=this.groups.reduce((n,g)=>n+g.ids.length,0);
    this.sourceLines=[];
    this.sourceOffset=-1;this.paintSource(0);
  }
  setLogs(logs){
    const next=logs.filter(l=>l.level==='scan').slice(-12).map(l=>({text:`${l.time} ${l.text}`,level:l.level}));
    const key=JSON.stringify(next);if(key===this.logKey)return;
    const previous=this.logs;this.logKey=key;this.logs=next;
    if(previous.length&&next.length&&previous[0].text!==next[0].text&&this.running&&!this.reducedMotion)this.dissolveLine(previous[0].text);
    this.paintSource(0,true);
  }
  paintSource(offset,force=false){
    if(!force&&this.renderedLogKey===this.logKey)return;
    this.renderedLogKey=this.logKey;this.sourceOffset=0;
    const feed=this.root.querySelector('.source-feed');
    const oldHeight=feed.getBoundingClientRect().height;
    feed.replaceChildren();
    for(const log of this.logs){
      const row=document.createElement('div');row.className='source-row log-row';row.title=log.text;
      const num=document.createElement('span');num.textContent='';
      const text=document.createElement('span');text.textContent=log.text;row.append(num,text);feed.append(row);
    }
    this.feedAnimation?.cancel();
    if(this.running&&!this.reducedMotion&&feed.animate){
      const added=Math.max(0,feed.getBoundingClientRect().height-oldHeight);
      this.feedAnimation=feed.animate([{transform:`translateY(${Math.min(added||24,90)}px)`,opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
    }
  }
  setState({running=false,progress=0,reducedMotion=this.reducedMotion,status='idle'}={}){
    const wasRunning=this.running;this.running=running;this.status=status;this.progress=Math.min(1,Math.max(0,Number(progress)||0));this.reducedMotion=reducedMotion;
    if(status==='idle'){this.logs=[];this.logKey='';this.paintSource(0,true);}
    if(!running)this.feedAnimation?.pause();else this.feedAnimation?.play();
    this.root.classList.toggle('flow-paused',!running);this.root.classList.toggle('flow-reduced',reducedMotion);
    if(reducedMotion||status==='cancelled'){this.particles=[];this.loops=[];this.landings=[];this.values=[...this.targets];}
    if(wasRunning!==running)this.lastTime=null;
    this.paint();this.wake();
  }
  setChecks(checked,totals){
    this.totals=totals;
    checked.forEach((target,g)=>{
      if(target===this.targets[g])return;
      this.targets[g]=target;
      if(this.reducedMotion||!this.running){this.values[g]=target;return;}
      // Counters and bar heads advance when the actual result batch lands.
      const delay=100+g*87,flight=410+(g*47)%150,at=this.clock+delay+flight;
      const origin=this.groups.find(group=>group.category===g)||this.groups[0],row=origin?(this.serial[origin.index]+g)%origin.rows:0,from=origin?this.point(origin.index,row,origin.cols-1):null,track=this.destinations[g];
      if(from&&track){const to={x:track.x+track.width*target/Math.max(1,totals[g]),y:track.y};this.particles.push({from:{...from},to,at:this.clock+delay,duration:flight,g,size:4.5,checkpoint:true});}
      this.landings.push({at,g,value:target});
    });this.paintBars();this.wake();
  }
  spawn(g){
    const category=this.groups[g].category,config=this.profiles[g],serial=this.serial[g]++,burst=1+(serial%config.burst);
    for(let b=0;b<burst;b++){
      const row=(serial+b+g)%this.groups[g].rows,start=this.clock+b*65,duration=config.duration+(serial*37+b*19)%230;
      this.loops.push({g,row,start,duration});
      const first=this.point(g,row,0),last=this.point(g,row,this.groups[g].cols-1),track=this.destinations[category];
      if(!first||!last||!track)continue;
      const source=this.sourcePoint;
      if(source)this.particles.push({from:{x:source.x+source.width/2-4,y:source.y-38+((serial+b)*17)%91},to:{...first},at:start,duration:240+(serial%3)*45,g:category,size:2.5,incoming:true});
      // Fine chips describe activity, not extra successful checks.
      const end=Math.max(.025,this.values[category]/Math.max(1,this.totals[category])),flight=390+(serial*37+g*51+b*23)%240;
      this.particles.push({from:{...last},to:{x:track.x+track.width*end,y:track.y},at:start+duration,duration:flight,g:category,size:2.5+(serial+b)%3*.6});
    }
    this.next[g]=this.clock+config.gap*(.6+((serial*17+g*13)%11)/10);
  }
  point(g,row,col){return this.points[this.cellIndices[g]?.[row*this.groups[g].cols+col]];}
  dissolveLine(text){
    const source=this.root.querySelector('.source-viewport'),box=this.root.getBoundingClientRect(),rect=source?.getBoundingClientRect();
    if(!rect||!text)return;
    const active=this.groups.filter(g=>g.ids.length);if(!active.length)return;
    // Fragment the line exactly at the top clipping edge, then feed enabled rules.
    const row=source.querySelector?.('.source-row');
    const fontSize=row&&typeof getComputedStyle==='function'?parseFloat(getComputedStyle(row).fontSize):10;
    const scale=fontSize/10,lineHeight=Math.ceil(14*scale);
    const width=Math.max(12,rect.width-23*scale),pixels=[];
    // Sample the outgoing glyphs, so the text itself breaks into square fragments.
    const raster=document.createElement('canvas');raster.width=Math.ceil(width);raster.height=lineHeight;
    const ink=raster.getContext?.('2d',{willReadFrequently:true});
    if(ink){ink.font=`${fontSize}px "Roboto Mono", "PingFang SC", monospace`;ink.fillStyle='#fff';ink.fillText(text,0,fontSize);const data=ink.getImageData(0,0,raster.width,lineHeight).data;
      for(let y=1;y<lineHeight-1;y+=2)for(let x=0;x<raster.width;x+=2)if(data[(y*raster.width+x)*4+3]>70)pixels.push({x,y});
    }
    const count=Math.min(42,pixels.length||Math.max(8,text.length));
    for(let i=0;i<count;i++){
      const g=active[(i+this.sourceOffset)%active.length],to=this.point(g.index,(i+this.sourceOffset)%g.rows,0);if(!to)continue;
      const pixel=pixels.length?pixels[Math.floor(i/count*pixels.length)]:{x:i/count*width,y:3+(i%3)*2};
      const from={x:rect.left-box.left+19*scale+pixel.x,y:rect.top-box.top+pixel.y-2};
      this.particles.push({from,to:{...to},at:this.clock+i*6,duration:650+(i*43)%390,g:g.category,size:1.2+(i%3)*.45,incoming:true,dissolve:true});
    }
  }
  paintBars(){
    this.fills.forEach((fill,g)=>{fill.style.width=Math.min(1,this.values[g]/Math.max(1,this.totals[g]))*100+'%';this.counts[g].textContent=`${this.values[g]}/${this.totals[g]}`;});
  }
  paint(){
    const ctx=this.ctx;ctx?.clearRect(0,0,this.width||0,this.height||0);
    const active=new Map(),trailing=new Set();
    for(const loop of this.loops){const phase=(this.clock-loop.start)/loop.duration,cols=this.groups[loop.g].cols;
      if(phase>=0&&phase<1){const col=Math.min(cols-1,Math.floor(phase*cols)),index=this.cellIndices[loop.g][loop.row*cols+col];active.set(index,1);
        for(let c=0;c<col;c++)trailing.add(this.cellIndices[loop.g][loop.row*cols+c]);
      }
    }
    this.nodes.forEach((node,i)=>{node.classList.toggle('active',active.has(i)&&!this.reducedMotion);node.classList.toggle('done',this.progress>=1);node.classList.toggle('trail',trailing.has(i)&&!this.reducedMotion);});
    for(const p of ctx?this.particles:[]){
      const t=(this.clock-p.at)/p.duration;if(t<0||t>1)continue;
      for(let trail=5;trail>=0;trail--){const v=ease(t-trail*.037),bend=p.incoming?-12:(p.g-1.5)*11;
        const x=p.from.x+(p.to.x-p.from.x)*v+Math.sin(Math.PI*v)*bend,y=p.from.y+(p.to.y-p.from.y)*v;
        ctx.globalAlpha=(trail?.22-trail*.029:1)*(p.dissolve?Math.min(1,t*8+.2):1);ctx.fillStyle=trail?PALETTE[p.g]:'#eaf5ff';ctx.shadowColor=PALETTE[p.g];ctx.shadowBlur=trail?0:9;
        const size=trail?Math.max(1,p.size-1.5):p.size;ctx.fillRect(x-size/2,y-size/2,size,size);
      }ctx.shadowBlur=0;ctx.globalAlpha=1;
    }
    this.paintBars();
  }
  wake(){if(!this.alive||this.frameId||document.hidden||this.reducedMotion)return;
    if(this.running||this.status==='complete'&&(this.particles.length||this.landings.length))this.frameId=requestAnimationFrame(t=>this.frame(t));
  }
  frame(time){
    this.frameId=0;if(!this.alive)return;
    const moving=this.running||this.status==='complete';if(!moving||this.reducedMotion){this.lastTime=null;return;}
    this.clock+=this.lastTime===null?0:Math.min(60,time-this.lastTime);this.lastTime=time;
    if(this.running){for(let g=0;g<this.groups.length;g++)if(this.groups[g].ids.length&&this.clock>=this.next[g])this.spawn(g);this.paintSource(Math.floor((this.clock-(this.sourceStart||0))/580));}
    for(const l of this.landings.filter(l=>l.at<=this.clock)){this.values[l.g]=Math.max(this.values[l.g],l.value);this.flash(l.g);}
    this.landings=this.landings.filter(l=>l.at>this.clock);
    for(const p of this.particles)if(!p.incoming&&this.clock>=p.at+p.duration&&!p.landed){p.landed=true;this.flash(p.g);}
    this.particles=this.particles.filter(p=>this.clock<p.at+p.duration+40);
    this.loops=this.loops.filter(l=>this.clock<l.start+l.duration);
    this.paint();this.wake();
  }
  flash(g){const fill=this.fills[g];fill.classList.remove('landed');void fill.offsetWidth;fill.classList.add('landed');}
  destroy(){this.feedAnimation?.cancel();this.alive=false;cancelAnimationFrame(this.frameId);this.observer.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);}
}
