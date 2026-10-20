// A compact, vertical adaptation of the original task → particle → bar workflow.
export class WorkflowVisual {
  constructor(root,{reducedMotion=false}={}) {
    this.root=root;this.canvas=root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    this.nodes=[...root.querySelectorAll('.agent-cell')];this.tracks=[...root.querySelectorAll('.bar-track')];
    this.particles=[];this.running=false;this.progress=0;this.group=0;this.reducedMotion=reducedMotion;this.frameId=0;this.alive=true;
    this.observer=new ResizeObserver(()=>this.measure());this.observer.observe(root);
    this.onVisibility=()=>{if(!document.hidden)this.draw(performance.now());};document.addEventListener('visibilitychange',this.onVisibility);
    this.measure();this.draw(performance.now());
  }
  measure(){
    const box=this.root.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=box.width*dpr;this.canvas.height=box.height*dpr;this.ctx?.setTransform(dpr,0,0,dpr,0,0);
    this.width=box.width;this.height=box.height;
    this.points=this.nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.left-box.left+r.width/2,y:r.top-box.top+r.height/2};});
    this.destinations=this.tracks.map(n=>{const r=n.getBoundingClientRect();return{x:r.left-box.left,y:r.top-box.top+r.height/2,width:r.width};});
  }
  setState({running=false,progress=0,group=0,reducedMotion=this.reducedMotion}={}){
    this.running=running;this.progress=Math.min(1,Math.max(0,Number(progress)||0));this.group=group;this.reducedMotion=reducedMotion;
    // Pausing/stopping must stop visual work too. Completed runs may finish
    // their final landing, while reduced motion always clears every particle.
    if(reducedMotion||!running&&this.progress<1)this.particles=[];
    if(!running||reducedMotion){cancelAnimationFrame(this.frameId);this.frameId=0;}
    this.root.classList.toggle('flow-paused',!running);
    if(!this.frameId&&!document.hidden)this.draw(performance.now());
  }
  pulse(group,bar,fraction=1){
    if(!this.alive||!this.running||this.reducedMotion||document.hidden)return;
    const now=performance.now(),nodeIndex=group*16+3+((this.particles.length%4)*4);
    const from=this.points?.[nodeIndex],track=this.destinations?.[bar];if(!from||!track)return;
    this.particles.push({from,to:{x:track.x+track.width*Math.min(.98,Math.max(.05,fraction)),y:track.y},at:now,duration:520,bar});
    if(!this.frameId)this.draw(now);
  }
  draw(time){
    if(!this.alive)return;cancelAnimationFrame(this.frameId);this.frameId=0;
    const ctx=this.ctx;ctx?.clearRect(0,0,this.width||0,this.height||0);
    const cycle=Math.floor(time/160)%4;
    this.nodes.forEach((node,i)=>{
      const group=Math.floor(i/16),row=Math.floor(i%16/4),col=i%4;
      node.classList.toggle('active',this.running&&!this.reducedMotion&&col===(cycle+row)%4&&group===this.group);
      node.classList.toggle('done',this.progress>0&&(group<this.group||this.progress>=1));
    });
    this.particles=this.particles.filter(p=>time-p.at<p.duration);
    for(const p of ctx?this.particles:[]){
      const t=Math.max(0,Math.min(1,(time-p.at)/p.duration));
      for(let trail=3;trail>=0;trail--){
        const v=Math.max(0,t-trail*.045),e=(1-Math.cos(Math.PI*v))/2;
        const x=p.from.x+(p.to.x-p.from.x)*e+Math.sin(Math.PI*e)*(p.bar-1.5)*5,y=p.from.y+(p.to.y-p.from.y)*e;
        ctx.fillStyle=trail?`rgba(220,250,237,${.18-trail*.035})`:'#f9fff7';ctx.shadowColor='#b7ead4';ctx.shadowBlur=trail?0:7;
        const size=trail?2:4;ctx.fillRect(x-size/2,y-size/2,size,size);
      }ctx.shadowBlur=0;
    }
    if((this.running&&!this.reducedMotion||this.particles.length)&&!document.hidden)this.frameId=requestAnimationFrame(t=>this.draw(t));
  }
  destroy(){this.alive=false;cancelAnimationFrame(this.frameId);this.frameId=0;this.particles=[];this.observer.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);}
}
