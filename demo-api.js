'use strict';
// Browser-only fallback used by the public sales demo. The FastAPI server wins
// whenever it is present; static hosting falls back to data stored in this browser.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const key = 'frontdesk-public-demo-v1';
  const now = () => new Date().toISOString();
  const services = kind => kind === 'dental' ? [
    {id:'new-patient',name:'New patient exam',minutes:60,price:'$149 demo estimate'},
    {id:'cleaning',name:'Routine cleaning',minutes:45,price:'$120 demo estimate'},
    {id:'consultation',name:'Dental consultation',minutes:30,price:'$75 demo estimate'}
  ] : [
    {id:'wellness',name:'Wellness exam',minutes:30,price:'$65 demo estimate'},
    {id:'vaccination',name:'Vaccination visit',minutes:30,price:'Staff will confirm'},
    {id:'new-pet',name:'New pet visit',minutes:45,price:'$85 demo estimate'}
  ];
  const providers = kind => kind === 'dental' ? [
    {id:'chen',name:'Dr. Maya Chen'},{id:'brooks',name:'Dr. Evan Brooks'}
  ] : [{id:'rivera',name:'Dr. Alex Rivera'},{id:'patel',name:'Dr. Sam Patel'}];
  const clinic = (id,name,kind,timezone,address) => ({id,name,kind,timezone,address,phone:'',transfer_phone:'',open_hour:9,close_hour:17,services:services(kind),providers:providers(kind),created_at:now()});
  const initial = () => ({
    clinics:[clinic('pearl-dental','Pearl Dental Studio','dental','America/New_York','Sample dental practice · New York'),clinic('willow-vet','Willow Veterinary Care','veterinary','America/Chicago','Sample veterinary practice · Austin')],
    appointments:[],callbacks:[],calls:[]
  });
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || initial(); } catch { return initial(); } };
  const write = data => localStorage.setItem(key,JSON.stringify(data));
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Frontdesk-Demo':'browser-local'}});
  const error = (detail,status=400) => json({detail},status);
  const uid = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-','').slice(0,16)}`;
  const body = async options => { try { return JSON.parse(options?.body || '{}'); } catch { return {}; } };
  const zonedDate = (year,month,day,hour,timeZone) => {
    const guess=new Date(Date.UTC(year,month-1,day,hour));
    const zone=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longOffset'}).formatToParts(guess).find(x=>x.type==='timeZoneName')?.value||'GMT+00:00';
    const match=zone.match(/GMT([+-])(\d{2}):(\d{2})/),offset=match?(Number(match[2])*60+Number(match[3]))*(match[1]==='-'?-1:1):0;
    return new Date(Date.UTC(year,month-1,day,hour)-offset*60000);
  };

  async function mock(path,options={}) {
    const url = new URL(path,location.origin), route=url.pathname.replace(/^\/api/,'');
    const method=(options.method||'GET').toUpperCase(), db=read();
    if(route==='/session') return json({user:{id:'demo-owner',email:'demo@frontdesk.local',role:'owner',clinic_id:null},local_demo_available:false});
    if(route==='/login'||route==='/local-demo-login'||route==='/logout') return json({ok:true});
    if(route==='/clinics'&&method==='GET') return json(db.clinics);
    if(route==='/readiness') return json({configured:false,mode:'Browser sales demo',live_call_verified:false,webhook:'Unavailable in browser-only demo',checks:[
      {name:'LLM dialogue',ready:false},{name:'Speech recognition',ready:false},{name:'Telephone provider',ready:false},{name:'Public voice server',ready:false}
    ]});
    let match=route.match(/^\/clinics\/([^/]+)\/dashboard$/);
    if(match){const c=db.clinics.find(x=>x.id===match[1]);if(!c)return error('Clinic not found.',404);const calls=db.calls.filter(x=>x.clinic_id===c.id),appointments=db.appointments.filter(x=>x.clinic_id===c.id),callbacks=db.callbacks.filter(x=>x.clinic_id===c.id);return json({clinic:c,appointments,calls,callbacks,stats:{calls:calls.length,seconds:calls.reduce((n,x)=>n+(x.duration_seconds||0),0)}});}
    match=route.match(/^\/clinics\/([^/]+)\/slots$/);
    if(match){const c=db.clinics.find(x=>x.id===match[1]);if(!c)return error('Clinic not found.',404);const service=c.services.find(x=>x.id===url.searchParams.get('service_id'));if(!service)return error('Unknown service.',400);const startText=url.searchParams.get('day'),base=startText?new Date(startText+'T12:00:00'):new Date();const slots=[];for(let day=0;day<7;day++){const date=new Date(base);date.setDate(date.getDate()+day);if([0,6].includes(date.getDay()))continue;for(const provider of c.providers){for(const hour of [c.open_hour,c.open_hour+2,c.open_hour+4]){if(hour>=c.close_hour)continue;const start=zonedDate(date.getFullYear(),date.getMonth()+1,date.getDate(),hour,c.timezone);if(start<new Date())continue;const end=new Date(start.getTime()+service.minutes*60000);const busy=db.appointments.some(a=>a.clinic_id===c.id&&a.provider_id===provider.id&&a.status==='confirmed'&&a.start<end.toISOString()&&a.end>start.toISOString());if(!busy){const dayLabel=new Intl.DateTimeFormat('en-US',{timeZone:c.timezone,weekday:'short',month:'short',day:'numeric'}).format(start),timeLabel=new Intl.DateTimeFormat('en-US',{timeZone:c.timezone,hour:'numeric',minute:'2-digit'}).format(start);slots.push({provider_id:provider.id,provider_name:provider.name,start:start.toISOString(),end:end.toISOString(),label:`${dayLabel} · ${timeLabel}`});}}}}return json(slots);}
    match=route.match(/^\/clinics\/([^/]+)\/appointments$/);
    if(match&&method==='POST'){const c=db.clinics.find(x=>x.id===match[1]);if(!c)return error('Clinic not found.',404);const data=await body(options),service=c.services.find(x=>x.id===data.service_id);if(!service||!data.confirmed)return error('Invalid test booking.',422);const repeated=db.appointments.find(x=>x.clinic_id===c.id&&x.idempotency_key===data.idempotency_key);if(repeated)return json(repeated);const start=new Date(data.start),end=new Date(start.getTime()+service.minutes*60000);if(db.appointments.some(x=>x.clinic_id===c.id&&x.provider_id===data.provider_id&&x.status==='confirmed'&&x.start<end.toISOString()&&x.end>start.toISOString()))return error('That time was just taken. Please choose another.',409);const saved={id:uid('apt'),clinic_id:c.id,...data,start:start.toISOString(),end:end.toISOString(),status:'confirmed',source:'browser_demo',created_at:now()};db.appointments.push(saved);write(db);return json(saved,201);}
    match=route.match(/^\/clinics\/([^/]+)\/appointments\/([^/]+)\/cancel$/);
    if(match&&method==='POST'){const item=db.appointments.find(x=>x.clinic_id===match[1]&&x.id===match[2]);if(!item)return error('Appointment not found.',404);item.status='cancelled';write(db);return json({ok:true});}
    match=route.match(/^\/clinics\/([^/]+)\/callbacks$/);
    if(match&&method==='POST'){const data=await body(options),saved={id:uid('callback'),clinic_id:match[1],...data,status:'open',created_at:now(),call_id:null};db.callbacks.push(saved);write(db);return json(saved,201);}
    match=route.match(/^\/clinics\/([^/]+)\/callbacks\/([^/]+)\/resolve$/);
    if(match&&method==='POST'){const item=db.callbacks.find(x=>x.clinic_id===match[1]&&x.id===match[2]);if(!item)return error('Callback not found.',404);item.status='resolved';write(db);return json({ok:true});}
    match=route.match(/^\/clinics\/([^/]+)\/members$/);
    if(match&&method==='POST')return json({...(await body(options)),clinic_id:match[1]},201);
    match=route.match(/^\/clinics\/([^/]+)$/);
    if(match&&method==='PUT'){const item=db.clinics.find(x=>x.id===match[1]);if(!item)return error('Clinic not found.',404);Object.assign(item,await body(options));write(db);return json(item);}
    if(route==='/clinics'&&method==='POST'){const data=await body(options),id=uid('clinic'),saved={...clinic(id,data.name,data.kind,data.timezone,data.address),...data,id};db.clinics.push(saved);write(db);return json(saved,201);}
    return error('This action is unavailable in the browser-only demo.',404);
  }

  window.fetch = async (input,options={}) => {
    const path=typeof input==='string'?input:input.url;
    if(!new URL(path,location.origin).pathname.startsWith('/api/'))return nativeFetch(input,options);
    try {const response=await nativeFetch(input,options);if(response.ok||response.headers.get('content-type')?.includes('application/json'))return response;} catch {}
    return mock(path,options);
  };
})();
