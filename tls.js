(function () {
    'use strict';
    var PROBE = 'ps4-tls-feasibility-v1';
    var BASE = 'https://192.168.1.155:8443';
    var RETURN = 'http://192.168.1.155:8088';
    var token = new URLSearchParams(location.hash.slice(1)).get('run');
    var rows = [], cleanups = [];
    var report = {probe:PROBE,run:token,origin:location.origin,userAgent:navigator.userAgent,checks:rows};
    var status = document.getElementById('status');
    window.addEventListener('pagehide', function () { cleanups.forEach(function (fn) { fn(); }); });
    function url(route) { return BASE + route + '?run=' + token; }
    function xhr(target, preflight) {
        return new Promise(function (resolve, reject) {
            var request = new XMLHttpRequest();
            request.open('GET', target, true); request.timeout = 4500;
            if (preflight) request.setRequestHeader('Content-Type','application/json');
            request.onload = function () { resolve({status:request.status,text:request.responseText}); };
            request.onerror = function () { reject(Error('Network or certificate error')); };
            request.ontimeout = function () { reject(Error('Timed out')); };
            request.onabort = function () { reject(Error('Aborted')); };
            request.send();
        });
    }
    function verify(response) {
        var value = JSON.parse(response.text);
        if (response.status !== 200 || value.probe !== PROBE || value.run !== token || value.tls !== true)
            throw Error('Wrong HTTPS fixture identity');
    }
    async function check(name, fn) {
        var row = {name:name,ok:false};
        try { await fn(); row.ok=true; } catch (error) { row.error=String(error.message || error); }
        rows.push(row);
        var li=document.createElement('li'); li.textContent=name+': '+(row.ok?'PASS':'FAIL - '+row.error);
        document.getElementById('checks').appendChild(li);
    }
    function events() {
        return new Promise(function (resolve,reject) {
            var source = new EventSource(url('/events')), done=false;
            function finish(error) {
                if(done)return;done=true;clearTimeout(timer);source.close();
                if(error)reject(error);else resolve();
            }
            var timer=setTimeout(function(){finish(Error('Event timed out'));},4500);
            source.onmessage=function(event){finish(event.data===token?null:Error('Wrong event identity'));};
            source.onerror=function(){finish(Error('Event network or certificate error'));};
            cleanups.push(function(){finish(Error('Page closed'));});
        });
    }
    function bridge() {
        return new Promise(function(resolve,reject){
            var frame=document.createElement('iframe'),done=false;
            frame.hidden=true;frame.title='TLS message control';
            function finish(error){
                if(done)return;done=true;clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();
                if(error)reject(error);else resolve();
            }
            function receive(event){
                if(event.source===frame.contentWindow && event.origin===BASE && event.data &&
                   event.data.type===PROBE && event.data.run===token)finish();
            }
            var timer=setTimeout(function(){finish(Error('TLS iframe timed out'));},4500);
            window.addEventListener('message',receive);
            cleanups.push(function(){finish(Error('Page closed'));});
            frame.src=url('/bridge');document.body.appendChild(frame);
        });
    }
    async function main(){
        if(!/^[a-f0-9]{24}$/.test(token || ''))throw Error('Start from the local test entry');
        await check('Static control',async function(){
            var r=await xhr('tls-control.json');if(r.status!==200||JSON.parse(r.text).probe!==PROBE)throw Error('Wrong static control');
        });
        await check('Missing static route',async function(){
            var r=await xhr('tls-missing-'+token);if(r.status!==404)throw Error('Expected HTTP404');
        });
        await check('TLS XHR',async function(){verify(await xhr(url('/health')));});
        await check('TLS fetch',async function(){
            var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},4500);
            try{var r=await fetch(url('/health'),{signal:controller.signal});verify({status:r.status,text:await r.text()});}
            finally{clearTimeout(timer);}
        });
        await check('TLS preflight',async function(){verify(await xhr(url('/health'),true));});
        await check('TLS events',events);
        await check('TLS iframe',bridge);
        report.verdict=!rows[0].ok||!rows[1].ok?'UNKNOWN':rows.every(function(row){return row.ok;})?'PASS':'FAIL';
        report.complete=true;window.TLS_PROBE_RESULT=report;status.textContent='TLS '+report.verdict;
        location.replace(RETURN+'/result?run='+token+'&data='+encodeURIComponent(JSON.stringify(report)));
    }
    main().catch(function(error){status.textContent='UNKNOWN: '+String(error.message||error);});
}());
