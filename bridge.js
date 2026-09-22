(function(){
 'use strict';
 var PROBE='ps4-frame-bridge-v1', BASE='http://192.168.1.155:8089';
 var token=new URLSearchParams(location.hash.slice(1)).get('run');
 var phase=location.protocol==='https:'?'https':'http';
 // Identical read-only code executes directly and inside each frame. No native
 // commands, configuration writes, payload uploads or dynamic remote code.
 async function agent(config){
  var rows=[],root=config.base,run=config.run;
  function xhr(route,preflight){return new Promise(function(resolve,reject){
   var r=new XMLHttpRequest();r.open('GET',root+route+'?run='+run,true);r.timeout=2500;
   if(preflight)r.setRequestHeader('Content-Type','application/json');
   r.onload=function(){resolve({status:r.status,text:r.responseText});};
   r.onerror=function(){reject(Error('Network error'));};r.ontimeout=function(){reject(Error('Timed out'));};r.send();
  });}
  function health(r){var v=JSON.parse(r.text);if(r.status!==200||v.probe!==config.probe||v.run!==run)throw Error('Wrong fixture identity');}
  async function check(name,fn){var row={name:name,ok:false};try{await fn();row.ok=true;}catch(e){row.error=String(e.message||e);}rows.push(row);}
  await check('XHR',async function(){health(await xhr('/health'));});
  await check('fetch',async function(){
   var c=new AbortController(),timer=setTimeout(function(){c.abort();},2500);
   try{var r=await fetch(root+'/health?run='+run,{signal:c.signal});health({status:r.status,text:await r.text()});}finally{clearTimeout(timer);}
  });
  await check('preflight',async function(){health(await xhr('/health',true));});
  await check('list',async function(){var r=await xhr('/list');if(r.status!==200||JSON.parse(r.text).count!==5)throw Error('Wrong list control');});
  await check('events',function(){return new Promise(function(resolve,reject){
   var e=new EventSource(root+'/events?run='+run),done=false;
   function finish(error){if(done)return;done=true;clearTimeout(timer);e.close();if(error)reject(error);else resolve();}
   var timer=setTimeout(function(){finish(Error('Events timed out'));},2500);
   e.onmessage=function(event){finish(event.data===run?null:Error('Wrong event identity'));};
   e.onerror=function(){finish(Error('Event network error'));};
  });});
  await check('missing',async function(){var r=await xhr('/missing');if(r.status!==404)throw Error('Expected404');});
  var report={probe:config.probe,run:run,nonce:config.nonce,mode:config.mode,origin:location.origin,rows:rows};
  if(config.mode==='direct')return report;
  parent.postMessage(report,config.parent);
 }
 if(location.pathname.endsWith('/bridge-child.html')){
  var config=JSON.parse(decodeURIComponent(location.hash.slice(1)));
  agent(config);return;
 }
 function framed(mode){return new Promise(function(resolve){
  var f=document.createElement('iframe'),nonce=token+':'+mode+':'+Math.random(),done=false;
  f.hidden=true;f.title='Read-only connection control';
  if(mode!=='data')f.setAttribute('sandbox','allow-scripts');
  var config={probe:PROBE,base:BASE,run:token,mode:mode,nonce:nonce,parent:location.origin};
  function finish(report){if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',receive);f.remove();resolve(report);}
  function receive(event){var d=event.data;
   if(event.source!==f.contentWindow||event.origin!=='null'||!d||d.probe!==PROBE||d.run!==token||d.nonce!==nonce||d.mode!==mode)return;
   finish(d);
  }
  var timer=setTimeout(function(){finish({mode:mode,error:'Frame timed out',rows:[]});},20000);
  window.addEventListener('message',receive);
  var content='<script>('+agent.toString()+')('+JSON.stringify(config)+');<\/script>';
  if(mode==='srcdoc')f.srcdoc=content;
  else if(mode==='data')f.src='data:text/html;charset=utf-8,'+encodeURIComponent(content);
  else f.src='bridge-child.html#'+encodeURIComponent(JSON.stringify(config));
  document.body.appendChild(f);
 });}
 async function main(){
  if(!/^[a-f0-9]{24}$/.test(token||''))throw Error('Start from the local test entry');
  var control=await fetch('bridge-control.json'),value=await control.json();
  if(control.status!==200||value.probe!==PROBE)throw Error('Static positive control failed');
  var missing=await fetch('bridge-no-such-file-'+token);if(missing.status!==404)throw Error('Static404 control failed');
  var report={probe:PROBE,run:token,phase:phase,origin:location.origin,userAgent:navigator.userAgent,staticControls:true,modes:[]};
  for(var mode of ['direct','srcdoc','data','sandboxhttps']){
   document.getElementById('status').textContent=phase.toUpperCase()+': testing '+mode+'...';
   var r=mode==='direct'?await agent({probe:PROBE,base:BASE,run:token,mode:mode}):await framed(mode);
   report.modes.push(r);var li=document.createElement('li');
   li.textContent=mode+': '+(r.rows.length===6&&r.rows.every(function(row){return row.ok;})?'PASS':'FAIL');
   document.getElementById('checks').appendChild(li);
  }
  report.complete=true;window.BRIDGE_PROBE_RESULT=report;
  location.replace(BASE+'/result?run='+token+'&data='+encodeURIComponent(JSON.stringify(report)));
 }
 main().catch(function(e){document.getElementById('status').textContent='UNKNOWN: '+String(e.message||e);});
}());
