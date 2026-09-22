(function () {
    'use strict';
    var BASE = 'http://127.0.0.1:8084';
    var VERSION = '0.5.1-ps4.8';
    var CATALOG = 'ad692d7307a87d7f98ee9d7ec83f9e75a3bc922a65d88622d7f0d4b12c1dca57';
    var PROBE = 'ps4-manager-https-v1';
    var params = new URLSearchParams(location.hash.slice(1));
    var phase = location.protocol === 'https:' ? 'https' : 'http';
    var run = params.get('run') || '';
    var reportOrigin = params.get('return') || '';
    var cleanup = [];
    var results = [];
    var errors = [];
    var result = {probe: PROBE, phase: phase, origin: location.origin,
        userAgent: navigator.userAgent, secureContext: window.isSecureContext === true,
        checks: results, errors: errors};
    window.PROBE_RESULT = null;
    window.addEventListener('pagehide', function () { cleanup.forEach(function (fn) { fn(); }); });
    window.addEventListener('error', function (event) {
        errors.push(String(event.message || 'script error').slice(0,180));
    });
    function message(id, text) { document.getElementById(id).textContent = text; }
    function add(name, status, detail) {
        results.push({name:name,status:status,detail:detail});
        var li = document.createElement('li'); li.className = status.toLowerCase();
        li.textContent = status + ': ' + name + ' - ' + detail;
        document.getElementById('checks').appendChild(li);
    }
    function xhr(url, headers, method, body) {
        return new Promise(function (resolve, reject) {
            var req = new XMLHttpRequest();
            req.open(method || 'GET', url, true); req.timeout = 3500;
            Object.keys(headers || {}).forEach(function (key) { req.setRequestHeader(key, headers[key]); });
            req.onload = function () { resolve({status:req.status,text:req.responseText}); };
            req.onerror = function () { reject(Error('Browser network error')); };
            req.ontimeout = function () { reject(Error('Timed out')); };
            req.onabort = function () { reject(Error('Aborted')); };
            cleanup.push(function () { req.abort(); }); req.send(body || null);
        });
    }
    function fetchText(url) {
        return new Promise(function (resolve, reject) {
            if (typeof fetch !== 'function') { reject(Error('fetch unavailable')); return; }
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = setTimeout(function () {
                if (controller) controller.abort(); reject(Error('Timed out'));
            }, 3500);
            if (controller) cleanup.push(function () { controller.abort(); });
            fetch(url, controller ? {signal:controller.signal} : {}).then(function (response) {
                return response.text().then(function (text) { return {status:response.status,text:text}; });
            }).then(function (response) { clearTimeout(timer); resolve(response); },
                function (error) { clearTimeout(timer); reject(error); });
        });
    }
    function validHealth(response) {
        var value = JSON.parse(response.text);
        if (response.status !== 200 || value.version !== VERSION || value.catalog !== CATALOG ||
                value.ready !== true || value.payload_count !== 5) throw Error('Unexpected manager identity/readiness');
        return 'Matching v165 manager, ready with five bundled payloads';
    }
    async function check(name, action) {
        try { add(name, 'PASS', await action()); return true; }
        catch (error) { add(name, 'FAIL', String(error.message || error).slice(0,180)); return false; }
    }
    function stream() {
        return new Promise(function (resolve, reject) {
            if (typeof EventSource !== 'function') { reject(Error('EventSource unavailable')); return; }
            var source = new EventSource(BASE + '/events');
            var done = false, opened = false;
            function finish(error) {
                if (done) return; done = true; clearTimeout(timer); source.close();
                if (error) reject(error); else resolve('Opened and received an event; stream closed; contents discarded');
            }
            var timer = setTimeout(function () {
                finish(Error(opened ? 'Opened but no event received' : 'Stream timed out'));
            }, 4500);
            cleanup.push(function () { finish(Error('Page closed')); });
            source.onopen = function () { opened = true; };
            source.onmessage = function (event) { if (typeof event.data === 'string' && event.data.length) finish(); };
            source.onerror = function () { finish(Error('Stream network error')); };
        });
    }
    function preferences() {
        return new Promise(function (resolve, reject) {
            var frame = document.createElement('iframe'); frame.hidden = true;
            frame.title = 'Read-only preference bridge';
            var nonce = PROBE + ':' + Date.now() + ':' + Math.random();
            var done = false;
            function finish(error) {
                if (done) return; done = true; clearTimeout(timer);
                window.removeEventListener('message', receive); frame.remove();
                if (error) reject(error); else resolve('Verified reply from console bridge; preference values discarded');
            }
            function receive(event) {
                if (event.source !== frame.contentWindow || event.origin !== BASE || !event.data ||
                    event.data.type !== 'ps4-manager-preferences' || event.data.nonce !== nonce) return;
                if (event.data.ok !== true) finish(Error('Bridge reached; console preference storage unavailable'));
                else finish();
            }
            var timer = setTimeout(function () { finish(Error('Preference bridge timed out')); },3500);
            cleanup.push(function () { finish(Error('Page closed')); });
            window.addEventListener('message', receive);
            frame.onload = function () {
                frame.contentWindow.postMessage({type:'ps4-manager-preferences-request',nonce:nonce},BASE);
            };
            frame.src = BASE + '/ui-preferences.html'; document.body.appendChild(frame);
        });
    }
    function callbackAllowed() {
        if (!/^[a-f0-9]{24}$/.test(run)) return false;
        try {
            var url = new URL(reportOrigin);
            var ip = url.hostname.split('.').map(Number);
            var privateHost = ip.length === 4 && ip.every(function (n) { return n >= 0 && n <= 255; }) &&
                (ip[0] === 127 || ip[0] === 10 || (ip[0] === 192 && ip[1] === 168) ||
                (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31));
            return privateHost && url.protocol === 'http:' && !url.username && !url.password &&
                url.pathname === '/' && !url.search && !url.hash && url.origin === reportOrigin;
        } catch (error) { return false; }
    }
    async function main() {
        message('phase', phase.toUpperCase() + ' comparison - checking the running console manager');
        add('JavaScript', 'PASS', 'Diagnostic script executed');
        var control = await check('Same-origin control', async function () {
            var response = await xhr('control.json?probe=' + Date.now());
            if (response.status !== 200 || JSON.parse(response.text).probe !== PROBE) throw Error('Static control mismatch');
            return 'Static JSON loaded from the current page origin';
        });
        var health = await check('Manager XHR', async function () { return validHealth(await xhr(BASE + '/health')); });
        await check('Manager fetch', async function () { return validHealth(await fetchText(BASE + '/health')); });
        await check('Read with CORS preflight', async function () {
            return validHealth(await xhr(BASE + '/health', {'Content-Type':'application/json'}));
        });
        await check('Payload list read', async function () {
            var response = await fetchText(BASE + '/list_payloads'), data = JSON.parse(response.text);
            if (response.status !== 200 || !Array.isArray(data.payloads) || data.payloads.length < 5)
                throw Error('Expected at least five payloads');
            return 'Payload list accessible; names discarded';
        });
        await check('Missing-route negative control', async function () {
            var response = await xhr('missing-probe-route-' + Date.now());
            if (response.status !== 404) throw Error('Expected static host HTTP404, received ' + response.status);
            return 'Missing static file correctly refused with HTTP404';
        });
        await check('Live log stream', stream);
        await check('Preference bridge (optional)', preferences);
        var core = results.filter(function (row) { return row.name !== 'Preference bridge (optional)'; });
        result.verdict = !control ? 'UNKNOWN' : core.every(function (row) { return row.status === 'PASS'; }) ? 'PASS' : 'FAIL';
        result.managerVerified = health;
        result.complete = true;
        window.PROBE_RESULT = result;
        message('summary', phase.toUpperCase() + ' result: ' + result.verdict);
        message('details', JSON.stringify(result,null,2));
        if (!callbackAllowed()) return;
        // A top-level navigation is deliberate: mixed-content restrictions on
        // XHR must not prevent an HTTPS failure report reaching the local PC.
        var encoded = encodeURIComponent(JSON.stringify(result));
        location.replace(reportOrigin + '/result?run=' + run + '&phase=' + phase + '&data=' + encoded);
    }
    main().catch(function (error) {
        message('summary','UNKNOWN: diagnostic stopped - ' + String(error.message || error));
        window.PROBE_RESULT = {probe:PROBE,phase:phase,complete:true,verdict:'UNKNOWN',error:String(error)};
    });
}());
