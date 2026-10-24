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
    this.values=[0,0,0,0];this.targets=[0,0,0,0];this.totals=[0,0,0,0];this.sourceKey='';this.logs=[];this.streamRows=new Map();this.streamOffset=0;this.streamVelocity=0;this.lastStreamFlush=-Infinity;
    this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(root);
    this.onVisibility=()=>{this.lastTime=null;if(!document.hidden)this.wake();};document.addEventListener('visibilitychange',this.onVisibility);
    this.measure();this.paint();
  }
  measure(){
    const box=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=box.width*dpr;this.canvas.height=box.height*dpr;this.ctx?.setTransform(dpr,0,0,dpr,0,0);
    if(this.width!==box.width||this.height!==box.height){this.particles=[];this.streamOffset=0;this.streamVelocity=0;const feed=this.root.querySelector('.source-feed');if(feed)feed.style.transform='';}
    this.width=box.width;this.height=box.height;
    // Canvas pixels must use the same material-aware inks as the CSS cells.
    const theme=typeof getComputedStyle==='function'?getComputedStyle(this.root):null;
    const token=name=>theme?.getPropertyValue?.(name)?.trim()||'';
    this.palette=PALETTE.map((color,i)=>token(`--flow-color-${i}`)||color);
    this.particleInk=token('--flow-particle-ink')||'#eaf5ff';
    this.particleGlow=token('--flow-particle-glow')===''?9:Math.max(0,Math.min(12,Number(token('--flow-particle-glow'))||0));
    const relative=n=>{const r=n.getBoundingClientRect();return{x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2,width:r.width};};
    this.points=this.nodes.map(relative);
    this.cellIndices=this.groups.map(g=>this.nodes.map((n,i)=>({n,i})).filter(({n})=>Number(n.dataset?.group)===g.index).map(({i})=>i));this.destinations=this.tracks.map(n=>{const r=relative(n);return{...r,x:r.x-r.width/2};});
    const panel=this.root.querySelector('.source-panel');this.sourcePoint=panel?relative(panel):null;
  }
  setSource(source,status='idle'){
    const key=(source?.id||'')+'\0'+(source?.text||'');
    const name=this.root.querySelector('.source-name');
    name.textContent=status==='idle'?'扫描记录':source?.filename||source?.name||'扫描记录';name.title=name.textContent;
    if(key===this.sourceKey)return;
    this.sourceKey=key;this.profiles=this.groups.map(g=>fileCadence(source,g));this.next=this.groups.map((g,i)=>this.clock+i*65);
  }
  setLogs(logs){
    // The source is the actual scan event log. No generated or looping code.
    const next=logs.filter(l=>l.level==='scan').slice(-12).map(l=>({
      key:String(l.id??`${l.time}\0${l.text}`),text:l.rule?`check(${JSON.stringify(l.rule)})`:l.text,
      detail:l.text,findings:l.findings,time:l.time,
    }));
    const key=JSON.stringify(next);if(key===this.logKey)return;
    this.logKey=key;this.logs=next;this.streamPending=true;
    if(this.status!=='paused'&&(!this.running||this.reducedMotion||this.clock-this.lastStreamFlush>=220))this.paintSource();
    this.wake();
  }
  paintSource(){
    if(!this.streamPending)return;
    this.streamPending=false;this.lastStreamFlush=this.clock;
    const feed=this.root.querySelector('.source-feed'),viewport=this.root.querySelector('.source-viewport');
    const animated=this.running&&!this.reducedMotion,wanted=new Set(this.logs.map(l=>l.key));
    const retained=[...this.streamRows.values()].find(item=>wanted.has(item.log.key));
    const oldTop=retained?.node.getBoundingClientRect().top;
    for(const [key,item] of this.streamRows)if(!wanted.has(key)){
      item.node.remove();this.streamRows.delete(key);
    }
    let added=0;
    for(const log of this.logs){
      if(this.streamRows.has(log.key))continue;
      const row=document.createElement('div');row.className='source-row log-row';row.title=log.detail;
      const code=document.createElement('code');code.className='source-code';code.textContent=log.text;
      row.append(code);
      if(Number.isFinite(log.findings)){
        const result=document.createElement('span');result.className='source-result';result.textContent=log.findings?`${log.findings} 项`:'✓';
        result.setAttribute('aria-label',log.findings?`${log.findings} 项待修订`:'通过');row.append(result);
      }
      feed.append(row);this.streamRows.set(log.key,{node:row,log,born:this.clock+Math.min(added*35,105),seen:false,dissolved:false});added++;
    }
    if(animated&&added){
      // Keep every retained row at its on-screen position. A continuous spring
      // absorbs new batches instead of cancelling/restarting a feed animation.
      const distance=retained?oldTop-retained.node.getBoundingClientRect().top:Math.min(feed.getBoundingClientRect().height,viewport.getBoundingClientRect().height*.55);
      this.streamOffset+=Math.max(0,distance);
    }else if(!animated){this.streamOffset=0;this.streamVelocity=0;}
    this.paintStream(0);
  }
  paintStream(delta){
    const feed=this.root.querySelector('.source-feed');
    if(this.running&&!this.reducedMotion&&delta>0){
      const dt=delta/1000,omega=19,decay=Math.exp(-omega*dt),term=this.streamVelocity+omega*this.streamOffset;
      this.streamVelocity=(this.streamVelocity-omega*term*dt)*decay;
      this.streamOffset=(this.streamOffset+term*dt)*decay;
      if(Math.abs(this.streamOffset)<.05&&Math.abs(this.streamVelocity)<.1){this.streamOffset=0;this.streamVelocity=0;}
    }
    feed.style.transform=this.streamOffset?`translate3d(0,${this.streamOffset.toFixed(3)}px,0)`:'';
    const entries=[...this.streamRows.values()];
    entries.forEach((item,index)=>{
      const age=Math.max(0,this.clock-item.born),p=this.reducedMotion||!this.running?1:Math.min(1,age/280),eased=1-Math.pow(1-p,3);
      item.node.style.opacity=String((.55+.45*(index+1)/Math.max(1,entries.length))*eased);
      item.node.style.transform=p<1?`translate3d(${(1-eased)*5}px,0,0)`:'';
      item.node.style.filter=p<1?`blur(${(1-eased)*1.6}px)`:'';
    });
    // Read geometry only once per frame, after the stream's transform is set.
    // An outgoing line dissolves at the real clipping edge, never on log append.
    if(this.running&&!this.reducedMotion){
      const viewport=this.root.querySelector('.source-viewport').getBoundingClientRect();
      for(const item of entries){
        const rect=item.node.getBoundingClientRect();
        if(rect.top>=viewport.top+4&&rect.bottom<=viewport.bottom+1)item.seen=true;
        if(item.seen&&!item.dissolved&&rect.top<viewport.top+4){item.dissolved=true;this.dissolveLine(item.log.text);}
      }
    }
  }
  setState({running=false,progress=0,reducedMotion=this.reducedMotion,status='idle'}={}){
    const wasRunning=this.running;this.running=running;this.status=status;this.progress=Math.min(1,Math.max(0,Number(progress)||0));this.reducedMotion=reducedMotion;
    if(status==='idle'&&(this.logs.length||this.streamRows.size)){
      this.logs=[];this.logKey='';this.streamPending=true;this.paintSource();
    }
    this.root.classList.toggle('flow-paused',!running);this.root.classList.toggle('flow-reduced',reducedMotion);
    this.root.classList.toggle('flow-idle',status==='idle');
    if(reducedMotion||status==='cancelled'||status==='complete'){
      if(this.streamPending)this.paintSource();this.streamOffset=0;this.streamVelocity=0;this.paintStream(0);
    }
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
      const g=active[i%active.length],to=this.point(g.index,i%g.rows,0);if(!to)continue;
      const pixel=pixels.length?pixels[Math.floor(i/count*pixels.length)]:{x:i/count*width,y:3+(i%3)*2};
      const from={x:rect.left-box.left+6*scale+pixel.x,y:rect.top-box.top+pixel.y-2};
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
        ctx.globalAlpha=(trail?.22-trail*.029:1)*(p.dissolve?Math.min(1,t*8+.2):1);ctx.fillStyle=trail?this.palette[p.g]:this.particleInk;ctx.shadowColor=this.palette[p.g];ctx.shadowBlur=trail?0:this.particleGlow;
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
    const delta=this.lastTime===null?0:Math.min(60,time-this.lastTime);this.clock+=delta;this.lastTime=time;
    if(this.running){for(let g=0;g<this.groups.length;g++)if(this.groups[g].ids.length&&this.clock>=this.next[g])this.spawn(g);if(this.clock-this.lastStreamFlush>=220)this.paintSource();this.paintStream(delta);}
    for(const l of this.landings.filter(l=>l.at<=this.clock)){this.values[l.g]=Math.max(this.values[l.g],l.value);this.flash(l.g);}
    this.landings=this.landings.filter(l=>l.at>this.clock);
    for(const p of this.particles)if(!p.incoming&&this.clock>=p.at+p.duration&&!p.landed){p.landed=true;this.flash(p.g);}
    this.particles=this.particles.filter(p=>this.clock<p.at+p.duration+40);
    this.loops=this.loops.filter(l=>this.clock<l.start+l.duration);
    this.paint();this.wake();
  }
  flash(g){const fill=this.fills[g];fill.classList.remove('landed');void fill.offsetWidth;fill.classList.add('landed');}
  destroy(){this.streamRows.clear();this.alive=false;cancelAnimationFrame(this.frameId);this.observer.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);}
}
