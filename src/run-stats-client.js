const prefix='wallet-forge.run-checkpoint.';
export const lifetimeMarkup=`<div class="lifetime-stats" title="Totals from recorded runs, including rejected addresses. Earlier unrecorded hunts are not included."><span>Total Wallets Checked: <strong id="lifetimeChecked">—</strong></span><span>Total Run Time: <strong id="lifetimeTime">—</strong> hours</span><small id="lifetimeStatus"></small></div>`;
export function formatRunTime(ms){
  const seconds=Math.max(0,Math.floor(ms/1000));
  return `${Math.floor(seconds/3600).toString().padStart(2,'0')}:${Math.floor(seconds/60)%60}`.replace(/:(\d)$/,':0$1')+':'+String(seconds%60).padStart(2,'0');
}
export function displayedTotals(remote,run){
  const checked=BigInt(remote.checked||0),elapsed=BigInt(remote.elapsedMs||0);
  const current=remote.current||{checked:0,elapsedMs:0};
  return {checked:checked+BigInt(Math.max(0,(run?.checked||0)-current.checked)),
    elapsedMs:elapsed+BigInt(Math.max(0,Math.floor(run?.elapsedMs||0)-current.elapsedMs))};
}

export class RunStatsClient {
  constructor({onTick=()=>{}}={}){
    this.onTick=onTick;this.remote=null;this.run=null;this.busy=false;
    this.timer=setInterval(()=>{this.render();if(this.run?.source==='cpu'&&this.run.active)this.checkpoint();},1000);
    this.poll=setInterval(()=>void this.sync(),5000);
    window.addEventListener('pagehide',()=>{
      const data=this.checkpoint(true);if(data)void fetch('/api/saved/run-progress',{method:'POST',headers:{'X-Wallet-Forge':'local','Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true}).catch(()=>{});
    });
    void this.sync();
  }
  elapsed(){return this.run?Math.floor(this.run.elapsedMs+(this.run.active?performance.now()-this.run.tick:0)):0;}
  begin(source){
    this.run={id:crypto.randomUUID(),source,checked:0,elapsedMs:0,tick:performance.now(),active:true};
    if(this.remote)this.remote={...this.remote,current:null};
    this.render();return this.run.id;
  }
  progress(checked,elapsedMs,done=false){
    if(!this.run)return;
    this.run.checked=Math.max(this.run.checked,checked);
    if(this.run.source==='gpu'&&Number.isFinite(elapsedMs)){this.run.elapsedMs=elapsedMs;this.run.tick=performance.now();this.run.active=!done;}
    this.render();
  }
  cancel(){this.run=null;if(this.remote)this.remote={...this.remote,current:null};this.render();}
  finish(){
    if(!this.run)return;
    this.run.elapsedMs=this.elapsed();this.run.active=false;
    this.checkpoint(true);this.render();void this.sync();
  }
  checkpoint(done=false){
    if(!this.run||this.run.source!=='cpu')return null;
    const data={id:this.run.id,checked:this.run.checked,elapsedMs:this.elapsed(),done:done||!this.run.active};
    try{localStorage.setItem(prefix+data.id,JSON.stringify(data));}catch{}
    this.pending=data;return data;
  }
  async request(path,data){
    const response=await fetch('/api/saved/'+path,{method:data?'POST':'GET',headers:{'X-Wallet-Forge':'local','Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Run totals unavailable. Restart XA Wallet Generator after updating.');
    return response.json();
  }
  async sync(){
    if(this.busy)return;this.busy=true;
    try{
      const pending=new Map();
      try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(prefix)){try{const data=JSON.parse(localStorage.getItem(key));pending.set(data.id,data);}catch{}}}}catch{}
      if(this.pending)pending.set(this.pending.id,this.pending);
      for(const data of pending.values()){
        await this.request('run-progress',data);
        try{if(localStorage.getItem(prefix+data.id)===JSON.stringify(data))localStorage.removeItem(prefix+data.id);}catch{}
        if(this.pending===data)this.pending=null;
      }
      const id=this.run?.id||'',remote=await this.request('run-totals?id='+encodeURIComponent(id));
      if((this.run?.id||'')===id)this.remote=remote;
      document.querySelector('#lifetimeStatus').textContent='';this.render();
    }catch(error){document.querySelector('#lifetimeStatus').textContent=error.message;}
    finally{this.busy=false;}
  }
  render(){
    const elapsedMs=this.elapsed();this.onTick(elapsedMs);
    if(!this.remote)return;
    const totals=displayedTotals(this.remote,this.run?{checked:this.run.checked,elapsedMs}:null);
    document.querySelector('#lifetimeChecked').textContent=totals.checked.toLocaleString();
    document.querySelector('#lifetimeTime').textContent=(Number(totals.elapsedMs)/3600000).toLocaleString(undefined,{minimumFractionDigits:3,maximumFractionDigits:3});
  }
}
