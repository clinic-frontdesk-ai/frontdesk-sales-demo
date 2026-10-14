'use strict';
const $ = (s, root = document) => root.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  wave:'M3 10v4m4-8v12m5-15v18m5-14v10m4-7v4',
  grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 14h3m4 0h3m-10 4h3',
  phone:'M8 3H4a1 1 0 0 0-1 1c0 10 7 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a13 13 0 0 1-6-6l2-2-2-5Z',
  inbox:'M4 4h16l2 12v4H2v-4L4 4Zm-2 12h6l2 3h4l2-3h6',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  arrow:'M4 12h16m-6-6 6 6-6 6',
  chevron:'m9 5 7 7-7 7',
  plus:'M12 5v14M5 12h14',
  check:'m5 12 4 4L19 6',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm-4 10 3 3 5-6',
  logout:'M9 4H4v16h5m6-13 5 5-5 5M9 12h11',
  close:'m6 6 12 12M6 18 18 6',
  leaf:'M20 3C7 1 2 9 6 16s16 3 14-13ZM5 21 16 9',
  building:'M4 21V3h12v18M16 10h4v11M1 21h22M8 7h4M8 11h4M8 15h4M9 21v-3h2v3',
  sparkle:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  info:'M12 11v6m0-10v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  play:'m9 5 11 7-11 7V5Z',
  mic:'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm-7 9v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
  phoneOff:'m3 3 18 18M8 3H4a1 1 0 0 0-1 1c0 10 7 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a13 13 0 0 1-6-6l2-2-2-5Z',
  people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-4a4 4 0 0 1 0 8',
};
const icon = (name, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.info}"/></svg>`;
const brand = () => `<div class="brand"><span class="brand-mark">${icon('wave')}</span>frontdesk<span class="brand-dot">.</span></div>`;
let state = {user:null,clinics:[],clinicId:null,data:null,readiness:null,page:'overview',selectedDay:null};
let booking = null;
let toastTimer;
let requestVersion = 0;
let voiceRecognition = null;
let voiceCallStartedAt = null;
let voiceCallTimer = null;
let voiceSpeechVersion = 0;
const modal = $('#modal');

async function api(path, options={}) {
  const r = await fetch('/api'+path, {credentials:'same-origin',...options,headers:{'Content-Type':'application/json','X-Frontdesk-Request':'1',...options.headers}});
  let data; try {data = await r.json();} catch {data = {};}
  if (!r.ok) {
    if (r.status === 401 && state.user) {state.user=null; await start();}
    const detail = Array.isArray(data.detail) ? data.detail.map(e=>`${e.loc?.slice(-1)[0] || 'Input'}: ${e.msg}`).join(' · ') : data.detail;
    throw new Error(detail || (r.status===403?'This action is not allowed.':'Something went wrong. Please try again.'));
  }
  return data;
}
function toast(message) {const t=$('#toast');t.textContent=message;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),4500);}
function timezone() {return state.data?.clinic.timezone || 'America/New_York';}
function dateFormat(value,options={}) {return new Intl.DateTimeFormat('en-US',{timeZone:timezone(),...options}).format(new Date(value));}
function localDay(value = new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:timezone(),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function prettyDate(value) {return dateFormat(value,{month:'short',day:'numeric',year:'numeric'});}
function hour(value) {return dateFormat(value,{hour:'numeric',minute:'2-digit'});}
function serviceName(id) {return state.data.clinic.services.find(x=>x.id===id)?.name||id;}
function providerName(id) {return state.data.clinic.providers.find(x=>x.id===id)?.name||id;}
function badge(text,kind='') {return `<span class="badge ${kind}">${esc(text)}</span>`;}
function empty(iconName,title,description,action='') {return `<div class="empty"><div class="empty-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;}
function notice(text) {return `<div class="notice">${icon('info')}<p>${esc(text)}</p></div>`;}
function button(label,action,cls='',iconName='') {return `<button type="button" class="btn ${cls}" data-action="${action}">${iconName?icon(iconName):''}${esc(label)}</button>`;}

async function start() {
  try {
    const session=await api('/session');
    state.user=session.user;
    if(!session.user) return renderLogin(session.local_demo_available);
    state.clinics=await api('/clinics');
    state.clinicId=state.clinics.some(x=>x.id===state.clinicId)?state.clinicId:state.clinics[0]?.id;
    if(!state.clinicId) throw new Error('No clinic assigned. Ask the platform owner to create your clinic.');
    await loadClinic();
  } catch(err) {$('#app').innerHTML=`<div class="boot">${esc(err.message)}<p><button class="btn" data-action="reload">Try again</button></p></div>`;}
}

function renderLogin(local) {
  $('#app').innerHTML=`<main class="login-page"><section class="login-art">${brand()}<div><div class="eyebrow">A LITTLE MORE HUMAN</div><h1>A warm welcome.<br>Every single call.</h1><p>A thoughtful AI receptionist for dental practices and veterinary clinics.</p></div><span class="small">Built for the people who care for everyone else.</span></section><section class="login-content"><form class="login-form" id="login-form"><h2>Welcome back.</h2><p>Your clinic's front desk, all in one place.</p><label class="field">Email<input type="email" name="email" autocomplete="username" required placeholder="you@yourclinic.com"></label><label class="field">Password<input type="password" name="password" autocomplete="current-password" required></label><div class="form-error" role="alert"></div><button class="btn primary full-width" type="submit">Sign in ${icon('arrow')}</button>${local?`<div class="login-divider">Running privately on this computer</div><button type="button" class="btn full-width" data-action="local-login">Open local demo ${icon('play')}</button>`:''}<p class="small muted section-gap">Pilot workspace · Test appointments only</p></form></section></main>`;
}

async function loadClinic() {
  const version=++requestVersion;
  const [data, readiness]=await Promise.all([api(`/clinics/${state.clinicId}/dashboard`),api('/readiness')]);
  if(version!==requestVersion)return;
  state.data=data;state.readiness=readiness;
  state.selectedDay=state.selectedDay||localDay();
  render();
}

function render() {
  const c=state.data.clinic;
  const callbacks=state.data.callbacks.filter(x=>x.status==='open').length;
  const titles={overview:'Overview',schedule:'Schedule',calls:'Calls & inbox',settings:'Clinic settings',launch:'Launch checklist'};
  const demoNote=state.readiness?.mode==='Browser sales demo'?'Browser-only sales demo · Data stays in this browser · No live phone connection':'Separate clinic access · No audio recordings stored · Demonstration workspace';
  $('#app').innerHTML=`<div class="shell"><aside class="sidebar">${brand()}<div class="workspace"><div class="eyebrow">YOUR WORKSPACE</div><label><span class="hide">Choose clinic</span><select id="clinic-select" aria-label="Choose clinic">${state.clinics.map(cl=>`<option value="${esc(cl.id)}" ${cl.id===c.id?'selected':''}>${esc(cl.name)}</option>`).join('')}</select></label></div><nav class="nav" aria-label="Main navigation">${[['overview','grid','Overview'],['schedule','calendar','Schedule'],['calls','inbox','Calls & inbox'],['settings','settings','Settings']].map(([id,ic,label])=>`<button class="nav-button ${state.page===id?'active':''}" data-page="${id}" ${state.page===id?'aria-current="page"':''}>${icon(ic)}${label}${id==='calls'&&callbacks?`<span class="count">${callbacks}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="pilot-note">${icon('leaf')}<h3>Your next chapter.</h3><p>Set up your phone line and bring your first demo to life.</p><button data-page="launch">View launch checklist ${icon('arrow')}</button></div><div class="user"><div class="avatar">${state.user.role==='owner'?'OW':'CL'}</div><div class="user-info"><strong>${state.user.role==='owner'?'Platform owner':'Clinic team'}</strong><span>${esc(state.user.email)}</span></div><button class="icon-button" aria-label="Sign out" data-action="logout">${icon('logout')}</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Workspace ${icon('chevron')} <b>${titles[state.page]}</b></div><div class="top-right"><span class="top-date">${dateFormat(new Date(),{weekday:'short',month:'short',day:'numeric'})}</span>${badge('Test schedule','dot')}</div></header><div class="content">${pageContent()}<div class="bottom-note">${icon('shield')}${esc(demoNote)}</div></div></main></div>`;
}

function pageContent() {
  if(state.page==='schedule')return schedulePage();
  if(state.page==='calls')return callsPage();
  if(state.page==='settings')return settingsPage();
  if(state.page==='launch')return launchPage();
  return overviewPage();
}
function heading(title,description,actions='') {return `<div class="page-heading"><div><h1>${title}</h1><p>${esc(description)}</p></div><div class="heading-buttons">${actions}</div></div>`;}

function overviewPage() {
  const c=state.data.clinic;
  const appointments=state.data.appointments.filter(x=>x.status==='confirmed');
  const upcoming=appointments.filter(x=>new Date(x.start)>new Date()).length;
  const callbacks=state.data.callbacks.filter(x=>x.status==='open').length;
  return `${heading('Your front desk, at a glance.',`A little more time for what matters at ${c.name}.`,`${state.user.role==='owner'?button('Add clinic','add-clinic','ghost','plus'):''}${button('Start demo call','voice-demo','primary','mic')}${button('Guided booking','book','','plus')}`)}
    <section class="hero"><div class="hero-copy"><div class="eyebrow">${icon('sparkle')} MADE FOR YOUR PRACTICE</div><h2>A warm welcome.<br>Every single call.</h2><p>Say the service and date. The receptionist understands the request, finds an opening and saves the confirmed test appointment.</p><div class="hero-actions">${button('Start demo call','voice-demo','lime','mic')}${button('Use guided booking','book','hero-secondary','play')}</div></div><div class="hero-visual" aria-hidden="true"><div class="orbit"></div><div class="orbit two"></div><div class="orbit three"></div><div class="voice-display"><div class="voice-title"><div class="voice-icon">${icon('wave')}</div><div>Your AI receptionist<span>English · ${c.kind==='dental'?'Dental care':'Veterinary care'}</span></div></div><div class="wave">${Array.from({length:31},()=>'<i></i>').join('')}</div><div class="voice-footer"><span>Website demo call</span><strong>Ready to try</strong></div></div></div></section>
    <div class="stats">${[['Calls received',state.data.stats.calls,'Actual phone sessions','phone'],['Test bookings',upcoming,'Upcoming confirmed appointments','calendar'],['Callback requests',callbacks,'Open requests in your inbox','inbox'],['Call minutes',(state.data.stats.seconds/60).toFixed(1),'Recorded session duration · all time','clock']].map(([title,value,note,ic])=>`<div class="stat"><div class="stat-title">${title}${icon(ic)}</div><div class="stat-value">${value}</div><p>${note}</p></div>`).join('')}</div>
    <div class="two-col"><section class="panel"><div class="panel-head"><div><h2>The week ahead</h2><p>Your test schedule · ${esc(c.timezone)}</p></div><button class="text-button" data-page="schedule">View schedule ${icon('arrow')}</button></div>${dayStrip()}${appointmentList()}</section><section class="panel"><div class="panel-head"><h2>Meet your receptionist</h2>${badge('Demo','gray')}</div><div class="agent-card"><div class="agent-intro"><div class="agent-avatar">${icon('wave')}</div><div><h3>${esc(c.name)}</h3><p>A friendly first impression, every time.</p></div></div><div class="detail-row"><span>Phone line</span><strong>${esc(c.phone||'Not connected')}</strong></div><div class="detail-row"><span>Language</span><strong>English (US)</strong></div><div class="detail-row"><span>Scheduling</span><strong>Weekdays · ${c.open_hour}:00–${c.close_hour}:00</strong></div><div class="quote">“Thank you for calling ${esc(c.name)}. I'm your AI receptionist. How can I help?”</div>${button('Phone demo setup','phone-setup','full-width','phone')}</div></section></div>`;
}

function dayStrip() {
  const base=new Date(localDay()+'T12:00:00Z');
  const days=Array.from({length:5},(_,i)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);return d;});
  return `<div class="days" role="group" aria-label="Select schedule day">${days.map(d=>{const key=d.toISOString().slice(0,10);return `<button class="day ${state.selectedDay===key?'active':''}" data-day="${key}" aria-pressed="${state.selectedDay===key}">${d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}<strong>${d.getUTCDate()}</strong></button>`;}).join('')}</div>`;
}
function appointmentList() {
  const items=state.data.appointments.filter(x=>x.status==='confirmed'&&localDay(x.start)===state.selectedDay).sort((a,b)=>a.start.localeCompare(b.start));
  if(!items.length)return empty('calendar','A little room in the day.','No test appointments on this date. Walk through a booking to see it appear here.',`<button class="text-button" data-action="book">Create a test booking ${icon('arrow')}</button>`);
  return items.map(x=>`<div class="appointment"><div class="appointment-time">${hour(x.start)}<span>${Math.round((new Date(x.end)-new Date(x.start))/60000)} min</span></div><div class="appointment-info"><strong>${esc(x.patient_name)}${x.pet_name?` · ${esc(x.pet_name)}`:''}</strong><p>${esc(serviceName(x.service_id))} · ${esc(providerName(x.provider_id))}</p></div><div class="appointment-icon">${icon('check')}</div></div>`).join('');
}

function schedulePage() {
  const items=[...state.data.appointments].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  return `${heading('A little room for everyone.','Create and manage appointments in your clinic’s test schedule.',button('New test booking','book','primary','plus'))}${notice('This calendar is separate from the clinic’s practice management system. Every appointment here is a test booking.')}<section class="panel"><div class="panel-head"><div><h2>Appointments</h2><p>${esc(timezone())} · Monday–Friday</p></div>${badge(`${items.length} records`,'gray')}</div>${items.length?`<div class="table-wrap"><table><thead><tr><th>Patient / owner</th><th>Visit</th><th>Date & time</th><th>Status</th><th>Action</th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${esc(x.patient_name)}</strong><span class="secondary">${esc(x.pet_name?`${x.pet_name} · ${x.species}`:x.phone)}</span></td><td>${esc(serviceName(x.service_id))}<span class="secondary">${esc(providerName(x.provider_id))}</span></td><td>${prettyDate(x.start)}<span class="secondary">${hour(x.start)}</span></td><td>${badge(x.status,x.status==='cancelled'?'gray':'')}</td><td>${x.status==='confirmed'?`<button class="text-button" data-cancel="${esc(x.id)}">Cancel</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('calendar','Your schedule starts here.','Book a fictional patient to try the complete flow.',button('Try a booking','book','','plus'))}</section>`;
}

function callsPage() {
  const calls=state.data.calls,callbacks=state.data.callbacks;
  return `${heading('Every conversation matters.','Phone activity and requests that need a human touch.',button('Add callback','callback','','plus'))}<section class="panel"><div class="panel-head"><div><h2>Callback inbox</h2><p>Requests saved for your team. Check this inbox regularly; notifications are not connected.</p></div>${badge(`${callbacks.filter(x=>x.status==='open').length} open`,'gray')}</div>${callbacks.length?callbacks.map(x=>`<div class="callback-row"><div class="avatar">${icon('people')}</div><div class="callback-main"><h3>${esc(x.name)} · ${esc(x.phone)}</h3><p>${esc(x.reason)}</p><small>${prettyDate(x.created_at)} · ${x.call_id?'Phone request':'Staff request'}</small></div>${x.status==='open'?`<button class="btn" data-resolve="${esc(x.id)}">Mark resolved</button>`:badge('Resolved','gray')}</div>`).join(''):empty('inbox','Nothing needs your attention.','Callback requests from your AI receptionist will appear here.')}</section><section class="panel section-gap"><div class="panel-head"><div><h2>Phone calls</h2><p>Action summaries only. Audio and full transcripts are not stored by this app.</p></div>${button('Refresh','refresh','ghost','clock')}</div>${calls.length?`<div class="table-wrap"><table><thead><tr><th>Caller</th><th>Time</th><th>Duration</th><th>Status</th><th>Outcome</th></tr></thead><tbody>${calls.map(x=>`<tr><td>${esc(x.caller||'Unknown caller')}</td><td>${prettyDate(x.started_at)}<span class="secondary">${hour(x.started_at)}</span></td><td>${Math.floor(x.duration_seconds/60)}m ${x.duration_seconds%60}s</td><td>${badge(x.status,'gray')}</td><td>${esc(x.outcome)}</td></tr>`).join('')}</tbody></table></div>`:empty('phone','Your first hello is ahead.','Connect a Twilio number to receive your first demonstration call.',button('Set up phone demo','phone-setup','','arrow'))}</section>`;
}

function clinicFields(c={},create=false) {
  const owner=state.user.role==='owner';
  return `<div class="form-grid"><label class="field wide">Clinic name<input name="name" value="${esc(c.name||'')}" required minlength="2" maxlength="100" placeholder="Your practice name"></label><label class="field">Practice type<select name="kind" ${!create?'disabled':''}><option value="dental" ${c.kind==='dental'?'selected':''}>Dental practice</option><option value="veterinary" ${c.kind==='veterinary'?'selected':''}>Veterinary clinic</option></select></label><label class="field">Time zone<select name="timezone">${['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'].map(t=>`<option value="${t}" ${(c.timezone||'America/New_York')===t?'selected':''}>${t.replace('America/','').replace('Pacific/','').replaceAll('_',' ')}</option>`).join('')}</select></label><label class="field wide">Address<input name="address" value="${esc(c.address||'')}" maxlength="240" placeholder="Street, city, state"></label><label class="field">AI phone number<input type="tel" name="phone" value="${esc(c.phone||'')}" ${!owner?'readonly':''} placeholder="+1 (212) 555-0100"><small>Assign a number you own in Twilio.</small></label><label class="field">Team transfer number<input type="tel" name="transfer_phone" value="${esc(c.transfer_phone||'')}" ${!owner?'readonly':''} placeholder="+1 (212) 555-0101"><small>A different line answered by your team.</small></label><label class="field">Opens at (weekdays)<select name="open_hour">${Array.from({length:23},(_,i)=>`<option value="${i}" ${(c.open_hour??9)===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select></label><label class="field">Closes at (weekdays)<select name="close_hour">${Array.from({length:23},(_,n)=>n+1).map(i=>`<option value="${i}" ${(c.close_hour??17)===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select></label></div>`;
}

function settingsPage() {
  const c=state.data.clinic;
  return `${heading('Make it feel like your clinic.','The details your receptionist uses in every conversation.',button('Sign out','logout','ghost','logout'))}
  <div class="settings-grid"><section class="panel"><div class="panel-head"><h2>Clinic details</h2>${badge(c.kind==='dental'?'Dental':'Veterinary','gray')}</div><form class="panel-body" id="settings-form">${clinicFields(c)}<div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">Save changes ${icon('check')}</button></div></form></section><div><section class="panel"><div class="panel-head"><h2>Demo services</h2></div><div class="panel-body">${c.services.map(s=>`<div class="service-row"><div>${esc(s.name)}<span>${esc(s.price)}</span></div><b>${s.minutes} min</b></div>`).join('')}<p class="small muted section-gap">Sample services, providers and estimates. Custom service configuration and calendar integration belong to clinic onboarding.</p></div></section>${state.user.role==='owner'?`<section class="panel section-gap"><div class="panel-head"><h2>Give your clinic access</h2></div><div class="panel-body"><p class="small muted">Create a staff login that can only access ${esc(c.name)}.</p>${button('Create staff account','member','full-width section-gap','people')}</div></section>`:''}</div></div>`;
}

function launchPage() {
  const c=state.data.clinic;
  const checks=[...state.readiness.checks,{name:'Clinic phone number assigned',ready:!!c.phone},{name:'Human transfer number assigned',ready:!!c.transfer_phone}];
  return `${heading('Your first call starts here.','Connect the services, then verify a real inbound demonstration call.',button('Refresh checks','refresh','','clock'))}${notice('The website demo call is ready now. The checklist below applies only to a real telephone connection.')}<div class="two-col"><section class="panel"><div class="readiness-head"><div class="eyebrow">TELEPHONE DEMO</div><h2 class="serif">From “hello” to a test booking.</h2><p class="small muted">Twilio → Pipecat → Deepgram + OpenAI → Test schedule</p></div><div class="panel-body">${checks.map(x=>`<div class="status-row"><div class="status-icon ${x.ready?'ready':''}">${icon(x.ready?'check':'clock')}</div><strong>${esc(x.name)}</strong>${badge(x.ready?'Configured':'Needed',x.ready?'':'amber')}</div>`).join('')}<p class="small muted section-gap">Keep API keys in the server’s private .env file. Never enter them in the clinic dashboard or send them to a caller.</p></div></section><div><section class="panel"><div class="panel-head"><h2>Twilio webhook</h2></div><div class="panel-body"><p class="small muted">In your phone number’s Voice configuration, set “A call comes in” to this URL using HTTP POST.</p><code class="code">${esc(state.readiness.webhook)}</code><p class="small muted section-gap">Set the call status callback to:</p><code class="code">${esc(state.readiness.webhook.replace('/inbound','/status'))}</code><p class="small muted section-gap">Detailed setup and a call acceptance checklist are included with the project.</p></div></section><section class="panel section-gap"><div class="panel-head"><h2>What you can show today</h2>${badge('Ready','')}</div><div class="panel-body"><p class="small muted">Browser speech recognition, date and service extraction, available times, test-calendar writes, double-booking protection and a callback inbox.</p>${button('Start website demo call','voice-demo','primary full-width section-gap','mic')}${button('Open guided booking','book','full-width section-gap','play')}</div></section></div></div>`;
}

function showModal(title,body) {modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>`;if(!modal.open)modal.showModal();}
function steps(active) {return `<div class="steps" aria-label="Step ${active} of 4">${[1,2,3,4].map(i=>`<span class="step ${i<=active?'active':''}"></span>`).join('')}</div>`;}

function stopVoiceCall() {
  if(voiceRecognition){try{voiceRecognition.abort();}catch{}voiceRecognition=null;}
  voiceSpeechVersion++;
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
  clearInterval(voiceCallTimer);voiceCallTimer=null;voiceCallStartedAt=null;
}
function voiceCallTime() {
  if(!voiceCallStartedAt)return '00:00';
  const seconds=Math.max(0,Math.floor((Date.now()-voiceCallStartedAt)/1000));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function updateVoiceCallTime() {
  const target=$('#voice-call-time');if(target)target.textContent=voiceCallTime();
}
function startVoiceCallTimer() {
  clearInterval(voiceCallTimer);updateVoiceCallTime();voiceCallTimer=setInterval(updateVoiceCallTime,1000);
}
function voiceCallFrame(content,status='Connected') {
  return `<div class="voice-call" aria-label="Browser demo call"><div class="voice-call-head"><div class="voice-call-identity"><span class="voice-call-avatar">${icon('wave')}</span><span><strong>${esc(state.data.clinic.name)}</strong><small>AI receptionist · English (US)</small></span></div><div class="voice-call-meta"><span class="voice-call-live"><i></i>${esc(status)}</span><time id="voice-call-time" aria-label="Call duration">${voiceCallTime()}</time></div></div><div class="voice-call-stage">${content}</div><div class="voice-call-disclosure">${icon('shield')} Browser voice simulation · fictional test data only</div></div>`;
}
function speakDemo(text,onEnd) {
  if(!('speechSynthesis' in window)){if(onEnd)onEnd();return false;}
  const version=++voiceSpeechVersion;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='en-US';utterance.rate=.98;utterance.pitch=1;
  let finished=false;
  const finish=()=>{if(finished||version!==voiceSpeechVersion)return;finished=true;if(onEnd)onEnd();};
  utterance.onend=finish;utterance.onerror=finish;
  setTimeout(finish,Math.min(8000,2000+text.length*45));
  window.speechSynthesis.speak(utterance);
  return true;
}
function voiceDemoForm(value='') {
  return `<form id="voice-intent-form" class="voice-type-form"><label class="field">Or type what you would say<input name="request" value="${esc(value)}" autocomplete="off" required placeholder="Cleaning next Tuesday afternoon"></label><button class="btn" type="submit">Send ${icon('arrow')}</button></form>`;
}
function beginVoiceDemo() {
  stopVoiceCall();
  booking={clinicId:state.clinicId,key:crypto.randomUUID(),step:1,details:{},voiceDemo:true};
  const example=state.data.clinic.kind==='dental'?'I need a cleaning next Tuesday afternoon.':'I need a vaccination visit tomorrow morning.';
  voiceCallStartedAt=Date.now();
  const body=`<div class="voice-demo"><div class="voice-demo-orb speaking">${icon('wave')}</div><div class="step-label">Connected browser call</div><h3>How can I help today?</h3><p class="voice-call-prompt">Try: “${esc(example)}”</p><div id="voice-status" class="voice-status speaking" role="status" aria-live="polite">The receptionist is greeting you…</div><div class="voice-call-controls">${button('Start talking','voice-listen','primary voice-listen','mic')}${button('End call','end-voice-call','call-end','phoneOff')}</div>${voiceDemoForm()}<p class="voice-privacy">Your browser may send microphone audio to its speech provider. Frontdesk does not store this recording.</p></div>`;
  showModal('Demo call',voiceCallFrame(body));startVoiceCallTimer();
  const greeting=`Thank you for calling ${state.data.clinic.name}. I'm your AI receptionist. How can I help today?`;
  speakDemo(greeting,()=>{voiceStatus('Your turn. Tap Start talking and say the service and date.','ready');const orb=$('.voice-demo-orb');if(orb)orb.classList.remove('speaking');});
}
function voiceStatus(message,kind='') {
  const target=$('#voice-status');
  if(target){target.textContent=message;target.className=`voice-status ${kind}`;}
}
function startVoiceListening(buttonElement) {
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){voiceStatus('Voice recognition is unavailable in this browser. Type the request below instead.','error');return;}
  voiceSpeechVersion++;
  if('speechSynthesis' in window)window.speechSynthesis.cancel();
  if(voiceRecognition){try{voiceRecognition.abort();}catch{}}
  const recognition=new Recognition();voiceRecognition=recognition;
  recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1;
  buttonElement.disabled=true;buttonElement.classList.add('listening');
  voiceStatus('Listening… say the service and date.','listening');
  const orb=$('.voice-demo-orb');if(orb)orb.classList.add('listening');
  recognition.onresult=event=>handleVoiceIntent(event.results[0][0].transcript);
  recognition.onerror=event=>{
    const denied=['not-allowed','service-not-allowed'].includes(event.error);
    voiceStatus(denied?'Microphone access was not available. Type the request below.':'I could not hear that clearly. Try again or type the request.','error');
  };
  recognition.onend=()=>{voiceRecognition=null;const button=$('[data-action="voice-listen"]');if(button){button.disabled=false;button.classList.remove('listening');}const orb=$('.voice-demo-orb');if(orb)orb.classList.remove('listening');};
  try{recognition.start();}catch{voiceStatus('The microphone is already in use. Try typing the request.','error');}
}
function formatRequestedDay(day) {
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'}).format(new Date(`${day}T12:00:00Z`));
}
function slotHourInClinic(slot) {
  return Number(new Intl.DateTimeFormat('en-US',{timeZone:timezone(),hour:'numeric',hourCycle:'h23'}).format(new Date(slot.start)));
}
async function handleVoiceIntent(transcript) {
  const parser=window.FrontdeskVoiceNLU;
  if(!parser){voiceStatus('The voice parser did not load. Use the guided booking instead.','error');return;}
  const intent=parser.parse(transcript,{kind:state.data.clinic.kind,services:state.data.clinic.services,baseDay:localDay()});
  if(!intent.complete){
    const missing=[!intent.serviceId?'service':'date'].filter(Boolean).join(' and ');
    voiceStatus(`I heard “${intent.transcript}”. Please include the ${missing}.`,'error');
    const input=$('#voice-intent-form input');if(input){input.value=intent.transcript;input.focus();}
    speakDemo(`Please include the ${missing}.`);return;
  }
  booking.serviceId=intent.serviceId;booking.voiceIntent=intent;
  showModal('Demo call',voiceCallFrame(`<div class="voice-demo voice-working"><div class="voice-demo-orb listening">${icon('wave')}</div><div class="step-label">Request understood</div><h3>${esc(serviceName(intent.serviceId))}</h3><p>${esc(formatRequestedDay(intent.day))}${intent.timeOfDay?` · ${esc(intent.timeOfDay)}`:''}</p><div class="voice-transcript"><span>You said</span>“${esc(intent.transcript)}”</div><div class="voice-status listening" role="status" aria-live="polite">Checking the test schedule…</div></div>`,'Checking schedule'));
  try{
    let slots=await api(`/clinics/${booking.clinicId}/slots?service_id=${encodeURIComponent(intent.serviceId)}&day=${encodeURIComponent(intent.day)}`);
    slots=slots.filter(slot=>localDay(slot.start)===intent.day);
    if(intent.timeOfDay){const ranges={morning:[0,12],afternoon:[12,17],evening:[17,24]},[start,end]=ranges[intent.timeOfDay];const preferred=slots.filter(slot=>{const hour=slotHourInClinic(slot);return hour>=start&&hour<end;});if(preferred.length)slots=preferred;}
    booking.slots=slots;
    if(!slots.length){
      showModal('Demo call',voiceCallFrame(`<div class="voice-demo"><div class="voice-demo-orb">${icon('calendar')}</div><h3>No test times were found.</h3><p>Try another date or use the guided calendar.</p>${voiceDemoForm(transcript)}<div class="voice-call-controls">${button('Open guided booking','book','primary')}${button('End call','end-voice-call','call-end','phoneOff')}</div></div>`));return;
    }
    const shown=slots.slice(0,6);
    showModal('Demo call',voiceCallFrame(`<div class="voice-result"><div class="voice-understood"><div><span>${icon('check')} Visit</span><strong>${esc(serviceName(intent.serviceId))}</strong></div><div><span>Date requested</span><strong>${esc(formatRequestedDay(intent.day))}${intent.timeOfDay?` · ${esc(intent.timeOfDay)}`:''}</strong></div></div><p class="voice-reply">“I found ${shown.length===1?'a time':'a few times'} that could work. Which do you prefer?”</p><div class="slots">${shown.map(slot=>{const index=booking.slots.indexOf(slot);return `<button class="slot" data-slot="${index}">${esc(slot.label)}<small>${esc(slot.provider_name)}</small></button>`;}).join('')}</div><div class="voice-call-controls">${button('Say a different request','voice-demo','ghost')}${button('End call','end-voice-call','call-end','phoneOff')}</div></div>`,'Receptionist speaking'));
    speakDemo(`I found ${shown.length===1?'a time':'a few times'} that could work. Which do you prefer?`);
  }catch(err){showModal('Could not load times',`<p>${esc(err.message)}</p>${button('Try again','voice-demo','primary')}`);}
}

function beginBooking() {
  booking={clinicId:state.clinicId, key:crypto.randomUUID(),step:1,details:{}};
  bookingServices();
}
function bookingServices() {
  booking.step=1;
  showModal('Try a test booking',`${steps(1)}<div class="step-label">01 / Choose a visit</div><p>A guided booking walkthrough, not a voice call. Use fictional details. Nothing is added to a real clinic calendar.</p>${state.data.clinic.services.map(s=>`<button class="service-choice" data-service="${esc(s.id)}"><div><strong>${esc(s.name)}</strong><span>${s.minutes} minutes · ${esc(s.price)}</span></div>${icon('arrow')}</button>`).join('')}`);
}
async function bookingSlots(serviceId,day=null) {
  booking.serviceId=serviceId;booking.step=2;
  showModal('Find a good time',`${steps(2)}<p>Checking the test schedule…</p>`);
  try {
    const current=booking;
    const slots=await api(`/clinics/${current.clinicId}/slots?service_id=${encodeURIComponent(serviceId)}${day?'&day='+encodeURIComponent(day):''}`);
    if(current!==booking||!modal.open)return;
    booking.slots=slots;
    showModal('Find a good time',`${steps(2)}<div class="step-label">02 / Available times</div><p>${esc(serviceName(serviceId))} · Times are shown in ${esc(timezone())}.</p><label class="field">Start from date<input id="slot-date" type="date" min="${localDay()}" value="${day||localDay()}"></label>${slots.length?`<div class="slots">${slots.slice(0,64).map((s,i)=>`<button class="slot" data-slot="${i}">${esc(s.label)}<small>${esc(s.provider_name)}</small></button>`).join('')}</div>`:empty('calendar','No openings found.','Choose a different starting date.')}<div class="form-actions">${button('Back','booking-services','ghost')}</div>`);
  } catch(err) {showModal('Could not load times',`<p>${esc(err.message)}</p>${button('Back to services','booking-services')}`);}
}
function bookingDetails(index) {
  if(index!==undefined)booking.slot=booking.slots[index];
  booking.step=3;
  const d=booking.details,vet=state.data.clinic.kind==='veterinary';
  showModal('Who are we welcoming?',`${steps(3)}<div class="step-label">03 / Fictional contact details</div><p>${esc(booking.slot.label)} · ${esc(booking.slot.provider_name)}</p><form id="booking-details"><div class="form-grid"><label class="field wide">${vet?'Owner':'Patient'} full name<input name="patient_name" required minlength="2" maxlength="100" value="${esc(d.patient_name||'')}" placeholder="e.g. Taylor Morgan" autocomplete="off"></label><label class="field wide">Callback phone number<input name="phone" type="tel" required value="${esc(d.phone||'')}" placeholder="e.g. (202) 555-0142" autocomplete="off"></label>${vet?`<label class="field">Pet name<input name="pet_name" required maxlength="80" value="${esc(d.pet_name||'')}" placeholder="e.g. Milo"></label><label class="field">Species<select name="species"><option value="Dog" ${d.species==='Dog'?'selected':''}>Dog</option><option value="Cat" ${d.species==='Cat'?'selected':''}>Cat</option><option value="Other" ${d.species==='Other'?'selected':''}>Other</option></select></label>`:''}</div><div class="form-error" role="alert"></div><div class="form-actions">${button('Back','booking-slots','ghost')}<button class="btn primary" type="submit">Review details ${icon('arrow')}</button></div></form>`);
}
function bookingReview() {
  booking.step=4;
  const d=booking.details;
  const rows=[['Visit',serviceName(booking.serviceId)],['When',booking.slot.label],['Provider',booking.slot.provider_name],['Name',d.patient_name],['Callback number',d.phone],...(d.pet_name?[['Pet',`${d.pet_name} · ${d.species}`]]:[])];
  showModal('One last look.',`${steps(4)}<div class="step-label">04 / Review & confirm</div><p>The receptionist reads these details back before asking permission to book.</p><div class="confirm-box">${rows.map(([label,value])=>`<div class="detail-row"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div><form id="booking-confirm"><label class="confirmation-check"><input type="checkbox" name="confirmed" required><span>I confirm these fictional details and understand this creates a test appointment only.</span></label><div class="form-error" role="alert"></div><div class="form-actions">${button('Edit details','booking-details','ghost')}<button class="btn primary" type="submit">Confirm test booking ${icon('check')}</button></div></form>`);
}
async function confirmBooking(form) {
  const submit=$('button[type="submit"]',form);submit.disabled=true;submit.textContent='Saving appointment…';
  try {
    const saved=await api(`/clinics/${booking.clinicId}/appointments`,{method:'POST',body:JSON.stringify({...booking.details,service_id:booking.serviceId,provider_id:booking.slot.provider_id,start:booking.slot.start,confirmed:true,idempotency_key:booking.key})});
    state.selectedDay=localDay(saved.start);
    await loadClinic();
    showModal('Test booking confirmed',`<div class="success"><div class="success-mark">${icon('check')}</div><h3>We'll see you in the schedule.</h3><p>${esc(booking.details.patient_name)}<br>${esc(booking.slot.label)}<br>${esc(booking.slot.provider_name)}</p>${badge('Saved in the test schedule')}<code class="code">Reference: ${esc(saved.id)}</code><p>No real clinic appointment was created. No SMS or email was sent.</p>${button('View appointment','view-booking','primary full-width','calendar')}</div>`);
  } catch(err) {$('.form-error',form).textContent=err.message;submit.disabled=false;submit.textContent='Confirm test booking';}
}

function addClinic() {showModal('Welcome a new clinic',`<p>Create a separate workspace with its own test schedule and phone routing.</p><form id="clinic-form">${clinicFields({},true)}<div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">Create clinic ${icon('plus')}</button></div></form>`);}
function addMember() {showModal('Create clinic access',`<p>This account will only see ${esc(state.data.clinic.name)}. Share the credentials privately with your clinic contact.</p><form id="member-form"><div class="form-grid"><label class="field wide">Staff email<input name="email" type="email" autocomplete="off" required></label><label class="field wide">Initial password<input name="password" type="password" minlength="16" maxlength="256" autocomplete="new-password" required><small>Use a unique password of at least 16 characters.</small></label></div><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">Create account</button></div></form>`);}
function addCallback() {showModal('Save a callback request',`<p>Use fictional details. The request is saved to this clinic’s inbox; it does not send a notification.</p><form id="callback-form"><div class="form-grid"><label class="field wide">Name<input name="name" minlength="2" maxlength="100" required></label><label class="field wide">Phone number<input name="phone" type="tel" required placeholder="(202) 555-0142"></label><label class="field wide">Reason<textarea name="reason" minlength="2" maxlength="300" required placeholder="e.g. Wants to discuss appointment options"></textarea></label></div><div class="form-error" role="alert"></div><div class="form-actions"><button class="btn primary" type="submit">Save request</button></div></form>`);}

document.addEventListener('click',async event=>{
  const el=event.target.closest('button');if(!el)return;
  try {
    if(el.dataset.page){state.page=el.dataset.page;render();return;}
    if(el.dataset.day){state.selectedDay=el.dataset.day;render();return;}
    if(el.dataset.service){await bookingSlots(el.dataset.service);return;}
    if(el.dataset.slot!==undefined){stopVoiceCall();bookingDetails(Number(el.dataset.slot));return;}
    if(el.dataset.cancel){const id=el.dataset.cancel;showModal('Cancel this test booking?',`<p>This releases the time in your test schedule. It does not affect any real clinic appointment.</p><div class="form-actions">${button('Keep appointment','close-modal')}<button class="btn danger" data-confirm-cancel="${esc(id)}">Cancel test booking</button></div>`);return;}
    if(el.dataset.confirmCancel){el.disabled=true;await api(`/clinics/${state.clinicId}/appointments/${el.dataset.confirmCancel}/cancel`,{method:'POST'});modal.close();await loadClinic();toast('Test booking cancelled. The time is available again.');return;}
    if(el.dataset.resolve){el.disabled=true;await api(`/clinics/${state.clinicId}/callbacks/${el.dataset.resolve}/resolve`,{method:'POST'});await loadClinic();toast('Callback marked resolved.');return;}
    switch(el.dataset.action){
      case 'reload': await start();break;
      case 'local-login': el.disabled=true;await api('/local-demo-login',{method:'POST'});await start();break;
      case 'logout': await api('/logout',{method:'POST'});state.user=null;await start();break;
      case 'book': stopVoiceCall();beginBooking();break;
      case 'voice-demo': beginVoiceDemo();break;
      case 'voice-listen': startVoiceListening(el);break;
      case 'end-voice-call': stopVoiceCall();modal.close();toast('Demo call ended. No recording was saved.');break;
      case 'close-modal': stopVoiceCall();modal.close();break;
      case 'phone-setup': state.page='launch';render();break;
      case 'refresh': el.disabled=true;await loadClinic();toast('Workspace updated.');break;
      case 'add-clinic':addClinic();break;
      case 'member':addMember();break;
      case 'callback':addCallback();break;
      case 'booking-services':bookingServices();break;
      case 'booking-slots':await bookingSlots(booking.serviceId);break;
      case 'booking-details':bookingDetails();break;
      case 'view-booking':modal.close();state.page='schedule';render();break;
    }
  }catch(err){el.disabled=false;toast(err.message);}
});

document.addEventListener('change',async event=>{
  try{
    if(event.target.id==='clinic-select'){state.clinicId=event.target.value;state.selectedDay=null;await loadClinic();}
    if(event.target.id==='slot-date'){await bookingSlots(booking.serviceId,event.target.value);}
  }catch(err){toast(err.message);}
});

document.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target;
  const data=Object.fromEntries(new FormData(form));
  const submit=$('button[type="submit"]',form);
  const error=$('.form-error',form);
  if(error)error.textContent='';
    if(form.id==='booking-confirm')return confirmBooking(form);
    if(form.id==='voice-intent-form'){await handleVoiceIntent(data.request);return;}
  if(submit)submit.disabled=true;
  try{
    if(form.id==='login-form'){await api('/login',{method:'POST',body:JSON.stringify(data)});await start();}
    if(form.id==='booking-details'){
      const digits=data.phone.replace(/\D/g,'');
      if(!(/^\d{10}$/.test(digits)||/^1\d{10}$/.test(digits)))throw new Error('Enter a 10-digit US phone number, optionally starting with +1.');
      data.phone='+'+(digits.length===10?'1':'')+digits;booking.details=data;bookingReview();
    }
    if(form.id==='settings-form'||form.id==='clinic-form'){
      data.open_hour=Number(data.open_hour);data.close_hour=Number(data.close_hour);
      if(form.id==='settings-form')data.kind=state.data.clinic.kind;
      const result=await api(form.id==='clinic-form'?'/clinics':`/clinics/${state.clinicId}`,{method:form.id==='clinic-form'?'POST':'PUT',body:JSON.stringify(data)});
      state.clinics=await api('/clinics');state.clinicId=result.id;state.selectedDay=null;
      modal.close();await loadClinic();toast(form.id==='clinic-form'?'Clinic workspace created.':'Clinic settings saved.');
    }
    if(form.id==='member-form'){await api(`/clinics/${state.clinicId}/members`,{method:'POST',body:JSON.stringify(data)});modal.close();toast('Staff account created with access to this clinic only.');}
    if(form.id==='callback-form'){await api(`/clinics/${state.clinicId}/callbacks`,{method:'POST',body:JSON.stringify(data)});modal.close();await loadClinic();toast('Callback request saved.');}
  }catch(err){if(error)error.textContent=err.message;else toast(err.message);}
  finally{if(submit)submit.disabled=false;}
});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){stopVoiceCall();modal.close();}}});
modal.addEventListener('close',stopVoiceCall);
start();
