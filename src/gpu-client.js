const headers={'X-Wallet-Forge':'local','Content-Type':'application/json'};
async function request(path,options={}) {
  const response=await fetch('/api/gpu/'+path,{...options,headers:{...headers,...options.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'GPU request failed');return data;
}
export async function gpuDevices(){const data=await request('devices');data.devices.hybridSupported=data.hybridSupported===true;return data.devices;}
export class GpuPool {
  constructor({devices,onProgress,onFinish,onError}){Object.assign(this,{devices,onProgress,onFinish,onError});this.active=false;}
  async start(config,_count,existing=[],rareExisting=[]) {
    this.active=true;this.stopping=false;this.forced=false;
    try {
      const data=await request('start',{method:'POST',body:JSON.stringify({config,devices:this.devices,existing,rareExisting})});
      this.token=data.token;
      if(this.stopping)await this.sendStop();
      this.poll();
    } catch(error){if(!this.active)return;this.active=false;this.onError(error.message);}
  }
  async poll(){
    if(!this.active)return;
    try {
      const data=await request('status',{headers:{'X-Wallet-Job':this.token}});
      if(!this.active)return;
      this.onProgress(data);
      if(data.done){this.active=false;if(data.error)this.onError(data.error);else this.onFinish(data.reason);return;}
      this.timer=setTimeout(()=>this.poll(),200);
    } catch(error){if(!this.active)return;this.active=false;this.sendStop().catch(()=>{});this.onError(error.message);}
  }
  async sendStop(){if(this.token)await request('stop',{method:'POST',headers:{'X-Wallet-Job':this.token},body:JSON.stringify({force:!!this.forced})});}
  forceStop(){this.forced=true;this.stop();}
  stop(){this.stopping=true;this.sendStop().catch(error=>{if(!this.active)return;this.active=false;clearTimeout(this.timer);this.onError(error.message);});}
}
