const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/Web/client.js'),'utf8');
test('Route isolation, active-server authentication, refresh and lifecycle cleanup',async()=>{
    const listeners=new Map(),observers=[],timers=new Map(),frames=new Map(),elements=new Map();
    let sequence=0;
    function on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);}
    function off(name,fn){listeners.get(name)?.delete(fn);}
    function node(id){const n={id,media:'not all',style:{},textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k]??null;},removeAttribute(k){delete this.attributes[k];},remove(){elements.delete(this.id);}};return n;}
    const root=node('html');root.setAttribute('data-theme','light');
    const style=node('MrBoneCrash-AbyssTheme-v1');elements.set(style.id,style);
    const unrelated=node('other-plugin');unrelated.media='all';
    const location=new URL('https://jelly.test/jellyfin/web/index.html#/home');
    let payload={settings:{enabled:true,forceDark:true,dashboardStyle:'safe',spotlight:false,reorderHome:false},css:'/* verified CSS */',dashboardCss:'/* safe palette */',token:'1'};
    const document={currentScript:{src:'https://jelly.test/jellyfin/AbyssTheme/client.js'},documentElement:root,hidden:false,body:{classList:{contains:()=>false}},
        head:{appendChild(n){elements.set(n.id,n);}},createElement:()=>node(''),getElementById:id=>elements.get(id)||null,
        querySelector:()=>null,querySelectorAll:q=>q.startsWith('#MrBoneCrash-AbyssTheme-v1')?[style]:[],
        addEventListener:(k,fn)=>on('document:'+k,fn),removeEventListener:(k,fn)=>off('document:'+k,fn)};
    const window={location,innerWidth:1440,addEventListener:on,removeEventListener:off,
        ApiClient:{serverAddress:()=> 'https://jelly.test/jellyfin',getCurrentUserId:()=> 'a'.repeat(32),accessToken:()=> 'synthetic-token'}};
    const context=vm.createContext({window,location,document,URL,AbortController,console,
        fetch:async()=>({ok:true,status:200,json:async()=>payload}),
        setInterval:fn=>{timers.set(++sequence,fn);return sequence;},clearInterval:id=>timers.delete(id),
        requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id),
        MutationObserver:class{constructor(fn){this.callback=fn;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}}});
    async function settle(){for(let i=0;i<15;i++){await Promise.resolve();for(const [id,fn]of [...frames]){frames.delete(id);fn();}}}
    async function event(name){for(const fn of [...listeners.get(name)||[]])fn();await settle();}
    vm.runInContext(source,context);await settle();
    assert.equal(style.media,'all');assert.equal(root.getAttribute('data-theme'),'dark');
    assert.equal(window.__MrBoneCrashAbyssThemeV1.getContext().auth.userId,'a'.repeat(32));
    window.ApiClient.serverAddress=()=> 'https://another.test';
    assert.equal(window.__MrBoneCrashAbyssThemeV1.getContext(),null);
    window.ApiClient.serverAddress=()=> 'https://jelly.test/jellyfin';
    for(const hash of ['#/dashboard/plugins','#/configurationpage?name=AbyssTheme']){
        location.hash=hash;await event('hashchange');
        assert.equal(style.media,'not all');assert.equal(root.getAttribute('data-theme'),'light');
        assert.equal(root.getAttribute('data-mbc-abyss-dashboard'),'safe');
    }
    location.hash='#/details?id=abc';await event('popstate');
    assert.equal(style.media,'all');assert.equal(root.getAttribute('data-theme'),'dark');
    vm.runInContext(source,context);await settle();
    assert.equal(listeners.get('hashchange').size,1);assert.equal(timers.size,1);
    assert.equal(observers.filter(n=>n.active).length,1);
    await event('pagehide');assert.equal(timers.size,0);assert.equal(root.getAttribute('data-theme'),'light');
    assert.ok(observers.every(n=>!n.active));
    await event('pageshow');assert.equal(timers.size,1);assert.equal(style.media,'all');
    payload={...payload,token:'2',settings:{...payload.settings,enabled:false}};
    await window.__MrBoneCrashAbyssThemeV1.reload();await settle();
    assert.equal(style.media,'not all');assert.equal(root.getAttribute('data-theme'),'light');
    window.__MrBoneCrashAbyssThemeV1.dispose();
    assert.equal(timers.size,0);assert.equal(frames.size,0);
    assert.ok([...listeners.values()].every(n=>n.size===0));assert.ok(observers.every(n=>!n.active));
    assert.equal(unrelated.media,'all');
});
