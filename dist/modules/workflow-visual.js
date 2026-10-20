// Narrow adaptation of reference/app.js: independent loops, fixed flight
// destinations, sine easing, trailing square chips and a flash on landing.
const PALETTE=['#73bdf5','#f3ce68','#a48af0','#6adeb1'];
export const CADENCE=[{gap:920,burst:1},{gap:390,burst:2},{gap:670,burst:1},{gap:225,burst:3}];
const ease=t=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,t))))/2;
export class WorkflowVisual {
  constructor(root,{reducedMotion=false}={}) {
    this.root=root;this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    this.nodes=[...root.querySelectorAll('.agent-cell')];this.tracks=[...root.querySelectorAll('.bar-track')];
    this.fills=[...root.querySelectorAll('.bar-fill')];this.counts=[...root.querySelectorAll('.rule-count')];
    this.particles=[];this.loops=[];this.landings=[];this.next=[0,90,230,45];this.serial=[0,0,0,0];
    this.clock=0;this.lastTime=null;this.running=false;this.progress=0;this.reducedMotion=reducedMotion;this.alive=true;this.frameId=0;
    this.values=[0,0,0,0];this.targets=[0,0,0,0];this.totals=[0,0,0,0];this.sourceKey='';this.sourceLines=[];
    this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(root);
    this.onVisibility=()=>{this.lastTime=null;if(!document.hidden)this.wake();};document.addEventListener('visibilitychange',this.onVisibility);
    this.measure();this.paint();
  }
  measure(){
    const box=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=box.width*dpr;this.canvas.height=box.height*dpr;this.ctx?.setTransform(dpr,0,0,dpr,0,0);
    this.width=box.width;this.height=box.height;
    const relative=n=>{const r=n.getBoundingClientRect();return{x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2,width:r.width};};
    this.points=this.nodes.map(relative);this.destinations=this.tracks.map(n=>{const r=relative(n);return{...r,x:r.x-r.width/2};});
    const panel=this.root.querySelector('.source-panel');this.sourcePoint=panel?relative(panel):null;
  }
  setSource(document,status='idle'){
    const key=(document?.id||'')+'\0'+(document?.text||'');
    this.root.querySelector('.source-state').textContent={running:'SCANNING',paused:'PAUSED',complete:'CHECKED',cancelled:'STOPPED',idle:'READY'}[status]||'READY';
    if(key===this.sourceKey)return;
    this.sourceKey=key;this.sourceStart=this.clock;
    this.root.querySelector('.source-name').textContent=document?.filename||document?.name||'copy.txt';
    this.sourceLines=(document?.text||'等待文案输入').split(/\r?\n/).map((text,i)=>({text,line:i+1})).filter(l=>l.text.trim()).slice(0,1000);
    this.sourceOffset=-1;this.paintSource(0);
  }
  paintSource(offset){
    if(offset===this.sourceOffset)return;this.sourceOffset=offset;
    const feed=this.root.querySelector('.source-feed');feed.replaceChildren();
    for(let i=0;i<9;i++){
      const line=this.sourceLines[(offset+i)%Math.max(1,this.sourceLines.length)];if(!line)continue;
      const row=document.createElement('div');row.className='source-row'+(i===3?' reading':'');
      const num=document.createElement('span');num.textContent=String(line.line).padStart(2,'0');
      const text=document.createElement('span');text.textContent=line.text;row.append(num,text);feed.append(row);
    }
    feed.classList.remove('advance');if(this.running&&!this.reducedMotion){void feed.offsetWidth;feed.classList.add('advance');}
  }
  setState({running=false,progress=0,reducedMotion=this.reducedMotion,status='idle'}={}){
    const wasRunning=this.running;this.running=running;this.status=status;this.progress=Math.min(1,Math.max(0,Number(progress)||0));this.reducedMotion=reducedMotion;
    this.root.classList.toggle('flow-paused',!running);this.root.classList.toggle('flow-reduced',reducedMotion);
    if(reducedMotion||status==='cancelled'){this.particles=[];this.loops=[];this.landings=[];this.values=[...this.targets];}
    if(wasRunning!==running)this.lastTime=null;
    this.paint();this.wake();
  }
  setChecks(checked,totals){
    this.totals=totals;const scale=Math.max(1,...totals);
    checked.forEach((target,g)=>{
      if(target===this.targets[g])return;
      this.targets[g]=target;
      if(this.reducedMotion||!this.running){this.values[g]=target;return;}
      // Counters and bar heads advance when the actual result batch lands.
      const delay=100+g*87,flight=410+(g*47)%150,at=this.clock+delay+flight;
      const row=(this.serial[g]+g)%4,from=this.points[g*16+row*4+3],track=this.destinations[g];
      if(from&&track){const to={x:track.x+track.width*target/scale,y:track.y};this.particles.push({from:{...from},to,at:this.clock+delay,duration:flight,g,size:4.5,checkpoint:true});}
      this.landings.push({at,g,value:target});
    });this.paintBars();this.wake();
  }
  spawn(g){
    const config=CADENCE[g],serial=this.serial[g]++,burst=1+(serial%config.burst),scale=Math.max(1,...this.totals);
    for(let b=0;b<burst;b++){
      const row=(serial*3+b+g)%4,start=this.clock+b*65,duration=620+(serial*37+g*53+b*19)%430;
      this.loops.push({g,row,start,duration});
      const first=this.points[g*16+row*4],last=this.points[g*16+row*4+3],track=this.destinations[g];
      if(!first||!last||!track)continue;
      const source=this.sourcePoint;
      if(source)this.particles.push({from:{x:source.x+source.width/2-4,y:source.y-38+((serial+b)*17)%91},to:{...first},at:start,duration:240+(serial%3)*45,g,size:2.5,incoming:true});
      // Fine chips describe activity, not extra successful checks.
      const end=Math.max(.025,this.values[g]/scale),flight=390+(serial*37+g*51+b*23)%240;
      this.particles.push({from:{...last},to:{x:track.x+track.width*end,y:track.y},at:start+duration,duration:flight,g,size:2.5+(serial+b)%3*.6});
    }
    this.next[g]=this.clock+config.gap*(.6+((serial*17+g*13)%11)/10);
  }
  paintBars(){
    const scale=Math.max(1,...this.totals);
    this.fills.forEach((fill,g)=>{fill.style.width=this.values[g]/scale*100+'%';this.counts[g].textContent=`${this.values[g]}/${this.totals[g]}`;});
  }
  paint(){
    const ctx=this.ctx;ctx?.clearRect(0,0,this.width||0,this.height||0);
    const active=new Map();
    for(const loop of this.loops){const phase=(this.clock-loop.start)/loop.duration;if(phase>=0&&phase<1)active.set(loop.g*16+loop.row*4+Math.min(3,Math.floor(phase*4)),Math.sin(phase*4%1*Math.PI));}
    this.nodes.forEach((node,i)=>{node.classList.toggle('active',active.has(i)&&!this.reducedMotion);node.classList.toggle('done',this.progress>=1);});
    for(const p of ctx?this.particles:[]){
      const t=(this.clock-p.at)/p.duration;if(t<0||t>1)continue;
      for(let trail=5;trail>=0;trail--){const v=ease(t-trail*.037),bend=p.incoming?-12:(p.g-1.5)*11;
        const x=p.from.x+(p.to.x-p.from.x)*v+Math.sin(Math.PI*v)*bend,y=p.from.y+(p.to.y-p.from.y)*v;
        ctx.globalAlpha=trail?.22-trail*.029:1;ctx.fillStyle=trail?PALETTE[p.g]:'#f8fff2';ctx.shadowColor=PALETTE[p.g];ctx.shadowBlur=trail?0:9;
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
    if(this.running){for(let g=0;g<4;g++)if(this.clock>=this.next[g])this.spawn(g);this.paintSource(Math.floor((this.clock-(this.sourceStart||0))/410));}
    for(const l of this.landings.filter(l=>l.at<=this.clock)){this.values[l.g]=Math.max(this.values[l.g],l.value);this.flash(l.g);}
    this.landings=this.landings.filter(l=>l.at>this.clock);
    for(const p of this.particles)if(!p.incoming&&this.clock>=p.at+p.duration&&!p.landed){p.landed=true;this.flash(p.g);}
    this.particles=this.particles.filter(p=>this.clock<p.at+p.duration+40);
    this.loops=this.loops.filter(l=>this.clock<l.start+l.duration);
    this.paint();this.wake();
  }
  flash(g){const fill=this.fills[g];fill.classList.remove('landed');void fill.offsetWidth;fill.classList.add('landed');}
  destroy(){this.alive=false;cancelAnimationFrame(this.frameId);this.observer.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);}
}
