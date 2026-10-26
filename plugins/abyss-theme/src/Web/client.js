(function () {
    'use strict';
    var key = '__MrBoneCrashAbyssThemeV1';
    if (window[key]) window[key].dispose();
    var script = document.currentScript;
    if (!script || !script.src || typeof fetch !== 'function' || typeof MutationObserver !== 'function') return;
    var assetRoot = new URL('./', script.src), serverRoot = new URL('../', assetRoot).href.replace(/\/$/, '');
    var data = null, fingerprint = '', disposed = false, running = false, timer = null, scheduled = null;
    var request = null, frame = null, frameHost = null, frameUser = '', frameToken = '';
    var backdrop = null, backdropUrl = '', darkOwned = false, originalTheme = null;
    var detailRequest=null, detailTimeout=null, detailKey='', detailBlob='';
    var orderEdits = [], orderContainer = null, originalDisplay = '', originalDirection = '', displayPriority = '', directionPriority = '', homePrefs = null, homePrefsUser = '', homeRequest = null;
    var nextHomeRead = 0, fullDashboardBlocked = false, latestRoute = '', info = { spotlight: 'Waiting for Jellyfin home', homeOrder: 'Unchanged', dashboard: 'Jellyfin default' };
    var observer = new MutationObserver(schedule);
    function styles() { return document.querySelectorAll('#MrBoneCrash-AbyssTheme-v1, style[data-abyss-override]'); }
    function attr(node, name, value) { if (value === null) node.removeAttribute(name); else node.setAttribute(name, value); }
    function route() {
        var hash = location.hash.replace(/^#\/?/, '');
        return hash || location.pathname.replace(/^.*?\/web\/?/, '').replace(/^index\.html\/?/, '');
    }
    function configuration() { return /^configurationpage(?:[/?]|$)/i.test(route()); }
    function dashboard() { return /^(dashboard|configurationpage)(?:[/?]|$)/i.test(route()); }
    function home() { return /^(?:home|index)?(?:[/?]|$)/i.test(route()) && !/[?&](?:tab|index)=(?:1|favorites)/i.test(route()); }
    function getContext() {
        if (!data || !data.settings.enabled || disposed) return null;
        try {
            var api = window.ApiClient;
            if (!api || !api.accessToken || !api.getCurrentUserId || !api.serverAddress) return null;
            var address = new URL(api.serverAddress(), location.href);
            if (address.href.replace(/\/$/, '') !== serverRoot) return null;
            var token = api.accessToken(), userId = api.getCurrentUserId();
            if (!token || !/^[a-f0-9-]{32,36}$/i.test(userId || '')) return null;
            return { baseUrl: serverRoot, auth: { token: token, userId: userId }, settings: data.settings };
        } catch (ignore) { return null; }
    }
    function dark(active) {
        var root = document.documentElement, value = root.getAttribute('data-theme');
        if (active && data.settings.forceDark) {
            if (value !== 'dark') { originalTheme = value; darkOwned = true; root.setAttribute('data-theme','dark'); }
        } else if (darkOwned) {
            if (value === 'dark') attr(root,'data-theme',originalTheme);
            darkOwned = false; originalTheme = null;
        }
    }
    function restoreOrder() {
        orderEdits.forEach(function(edit) { if (edit.node.style.order === edit.applied && !edit.node.style.getPropertyPriority('order')) edit.node.style.setProperty('order', edit.original, edit.priority); });
        orderEdits = [];
        if (orderContainer) {
            if (orderContainer.style.display === 'flex' && !orderContainer.style.getPropertyPriority('display')) orderContainer.style.setProperty('display',originalDisplay,displayPriority);
            if (orderContainer.style.flexDirection === 'column' && !orderContainer.style.getPropertyPriority('flex-direction')) orderContainer.style.setProperty('flex-direction',originalDirection,directionPriority);
        }
        orderContainer = null;
    }
    function resetBackdrop() {
        if (backdrop) backdrop.remove();
        backdrop = null; backdropUrl = '';
    }
    function syncBackdrop(url, detail) {
        if (!data.settings.showBackdrops || (!detail&&!data.settings.spotlightPageBackdrop) || !url || url.indexOf('blob:' + location.origin + '/') !== 0) { resetBackdrop(); return; }
        var container = document.querySelector('.backdropContainer');
        if (!container) return;
        if (!backdrop) {
            backdrop = document.createElement('div'); backdrop.id = 'MrBoneCrash-AbyssBackdrop';
            backdrop.style.cssText = 'position:absolute;inset:0;pointer-events:none;background-size:cover;background-position:center;opacity:.8;';
            container.appendChild(backdrop);
        }
        backdrop.style.filter = 'blur(' + (data.settings.liteMode ? Math.min(12,data.settings.backdropBlur) : data.settings.backdropBlur) + 'px) brightness(.3)';
        if (backdropUrl !== url) { backdropUrl = url; backdrop.style.backgroundImage = 'url("' + url + '")'; }
    }
    function removeFrame() {
        var hadFrame=!!frame;
        if (frame && frame.contentWindow) { try { frame.contentWindow.postMessage({type:'abyss-spotlight',action:'dispose'},location.origin); } catch(ignore){} }
        if (frameHost) frameHost.remove();
        frame = null; frameHost = null; frameUser = ''; frameToken = '';
        if(hadFrame)resetBackdrop();
    }
    function clearDetails() {
        if(detailRequest)detailRequest.abort();detailRequest=null;
        if(detailTimeout!==null)clearTimeout(detailTimeout);detailTimeout=null;
        if(detailBlob){if(backdropUrl===detailBlob)resetBackdrop();URL.revokeObjectURL(detailBlob);detailBlob='';}
        detailKey='';
    }
    function detailBackdrop(active) {
        var context=getContext(), match=route().match(/^details\?[^#]*\bid=([a-f0-9-]{32,36})(?:&|$)/i);
        if(!active||!data.settings.showBackdrops||!context||!match){clearDetails();return;}
        var identity=context.auth.userId+':'+match[1]+':'+data.token;
        if(identity===detailKey)return;
        clearDetails();detailKey=identity;
        var controller=new AbortController();detailRequest=controller;
        detailTimeout=setTimeout(function(){controller.abort();},20000);
        var headers={Authorization:'MediaBrowser Token="'+context.auth.token+'"'};
        fetch(serverRoot+'/Users/'+encodeURIComponent(context.auth.userId)+'/Items/'+encodeURIComponent(match[1]),{headers:headers,signal:controller.signal})
            .then(function(response){if(!response.ok)throw new Error('Item unavailable');return response.json();})
            .then(function(item){
                var id=item.BackdropImageTags&&item.BackdropImageTags.length?item.Id:item.ParentBackdropItemId;
                if(!/^[a-f0-9-]{32,36}$/i.test(id||''))return null;
                return fetch(serverRoot+'/Items/'+encodeURIComponent(id)+'/Images/Backdrop/0?maxWidth=1920&quality=88',{headers:headers,signal:controller.signal});
            }).then(function(response){return response&&response.ok?response.blob():null;}).then(function(blob){
                var current=getContext();
                if(!blob||controller.signal.aborted||detailKey!==identity||!current||current.auth.userId!==context.auth.userId||!running)return;
                detailBlob=URL.createObjectURL(blob);syncBackdrop(detailBlob,true);
            }).catch(function(){/* A missing or inaccessible image leaves ordinary Jellyfin intact. */})
            .then(function(){if(detailRequest===controller){detailRequest=null;clearTimeout(detailTimeout);detailTimeout=null;}});
    }
    function readHomePreferences(context) {
        if (homePrefsUser === context.auth.userId && homePrefs) return;
        if (homeRequest) return;
        if (Date.now() < nextHomeRead) return;
        nextHomeRead = Date.now() + 30000;
        var controller = new AbortController(); homeRequest = controller;
        fetch(serverRoot + '/DisplayPreferences/usersettings?userId=' + encodeURIComponent(context.auth.userId) + '&client=emby', {
            headers:{Authorization:'MediaBrowser Token="' + context.auth.token + '"'}, signal:controller.signal
        }).then(function(response){if(!response.ok)throw new Error('Preferences unavailable');return response.json();}).then(function(value){
            var current = getContext();
            if (!current || current.auth.userId !== context.auth.userId || !running) return;
            homePrefs=value.CustomPrefs||{};homePrefsUser=context.auth.userId;schedule();
        }).catch(function(){info.homeOrder='Could not read the current account’s home layout';}).then(function(){if(homeRequest===controller)homeRequest=null;});
    }
    function reorder(host,context) {
        if (!data.settings.reorderHome || !host || !context || document.body.classList.contains('layout-tv')) { restoreOrder();info.homeOrder='Unchanged';return; }
        readHomePreferences(context);
        if (!homePrefs || homePrefsUser !== context.auth.userId) return;
        var container=host.querySelector('.sections');
        if(!container)return;
        var defaults=['smalllibrarytiles','resume','resumeaudio','resumebook','livetv','nextup','latestmedia','none','none','none'];
        var nodes=Array.from(container.children), mapping={};
        nodes.forEach(function(node){
            var match=node.className.match(/(?:^|\s)section(\d+)(?:\s|$)/);
            if(match){var index=Number(match[1]);var type=homePrefs['homesection'+index]||defaults[index];if(type==='folders')type='smalllibrarytiles';if(data.settings.homeOrder.indexOf(type)!==-1&&!mapping[type])mapping[type]=node;}
        });
        if(!data.settings.homeOrder.every(function(type){return mapping[type];})){restoreOrder();info.homeOrder='Home sections do not match the supported layout';return;}
        if(orderContainer!==container || nodes.some(function(node){return !orderEdits.some(function(edit){return edit.node===node;});})) {
            restoreOrder();orderContainer=container;originalDisplay=container.style.display;originalDirection=container.style.flexDirection;displayPriority=container.style.getPropertyPriority('display');directionPriority=container.style.getPropertyPriority('flex-direction');
            container.style.display='flex';container.style.flexDirection='column';
            orderEdits=nodes.map(function(node,index){return {node:node,original:node.style.order,priority:node.style.getPropertyPriority('order'),applied:String(100+index)};});
        }
        orderEdits.forEach(function(edit,index){
            var type=data.settings.homeOrder.find(function(type){return mapping[type]===edit.node;});
            edit.applied=String(type?data.settings.homeOrder.indexOf(type):100+index);edit.node.style.order=edit.applied;
        });
        info.homeOrder='Recommended order applied temporarily';
    }
    function spotlight(active) {
        var context=getContext();
        var host=home() && document.querySelector('#indexPage:not(.hide) #homeTab');
        var favorites=document.querySelector('#indexPage:not(.hide) #favoritesTab.is-active');
        if (!active || !home() || !host || favorites || document.hidden || !context) {
            removeFrame();restoreOrder();info.spotlight=active?'Waiting for a signed-in, compatible home view':'Inactive on this view';return;
        }
        reorder(host,context);
        if(!data.settings.spotlight){removeFrame();info.spotlight='Disabled in settings';return;}
        if(data.settings.spotlightYieldToOtherBanners && (host.querySelector('.featurediframe:not(#MrBoneCrash-AbyssSpotlightFrame)') || document.querySelector('#slides-container'))) {
            removeFrame();info.spotlight='Hidden to avoid a duplicate home banner';return;
        }
        if(frame && (frameUser!==context.auth.userId||frameToken!==data.token||frameHost.parentNode!==host))removeFrame();
        if(!frame) {
            frameHost=document.createElement('section');frameHost.id='MrBoneCrash-AbyssSpotlight';frameHost.setAttribute('aria-label','Abyss Spotlight');frameHost.style.cssText='width:100%;position:relative;clear:both;';
            frame=document.createElement('iframe');frame.id='MrBoneCrash-AbyssSpotlightFrame';frame.title='Abyss Spotlight';frame.className='mbc-abyss-spotlight-frame';
            frame.style.cssText='border:0;width:100%;display:block;background:transparent;min-height:260px;max-height:1000px;';
            frame.src=new URL('spotlight.html?v='+data.token,assetRoot).href;
            frameHost.appendChild(frame);host.insertBefore(frameHost,host.querySelector('.sections')||host.firstChild);
            frameUser=context.auth.userId;frameToken=data.token;
            frame.addEventListener('load',function(){if(frame&&frame.contentWindow)frame.contentWindow.postMessage({type:'abyss-spotlight',action:'resume'},location.origin);});
        }
        var height=window.innerWidth<=600?data.settings.spotlightMobileHeight:data.settings.spotlightHeight;
        frame.style.height=height+'vh';info.spotlight='Running for the current account';
        if(!data.settings.showBackdrops||!data.settings.spotlightPageBackdrop)resetBackdrop();
    }
    function update() {
        scheduled=null;if(disposed||!running||!data)return;
        var config=configuration(),dash=dashboard(),active=data.settings.enabled;
        var full=dash&&!config&&data.settings.dashboardStyle==='full'&&!fullDashboardBlocked;
        var themed=active&&(!dash||full);
        styles().forEach(function(style){var media=themed?'all':'not all';if(style.media!==media)style.media=media;});
        var safe=active&&dash&&(config||data.settings.dashboardStyle==='safe'||fullDashboardBlocked);
        if (safe) document.documentElement.setAttribute('data-mbc-abyss-dashboard','safe');
        else document.documentElement.removeAttribute('data-mbc-abyss-dashboard');
        info.dashboard=dash?(fullDashboardBlocked?'Safe palette: upstream navigation overlap detected':safe?'Safe palette':full?'Full upstream styling':'Jellyfin default'):'Not on dashboard';
        dark(themed);
        if(full) {
            var drawer=document.querySelector('.MuiDrawer-paper');
            if(drawer&&drawer.getBoundingClientRect().width>Math.min(400,window.innerWidth*.35)) {
                fullDashboardBlocked=true;info.dashboard='Safe palette: upstream navigation overlap detected';update();return;
            }
        }
        var nextRoute=route();
        if(nextRoute!==latestRoute){latestRoute=nextRoute;if(home()){homePrefs=null;homePrefsUser='';nextHomeRead=0;}}
        spotlight(themed&&!dash);
        detailBackdrop(themed&&!dash&&!document.hidden);
        if(!themed)resetBackdrop();
    }
    function schedule() { if(!running||disposed||scheduled!==null)return;scheduled=requestAnimationFrame(update); }
    function message(event) {
        if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||!event.data)return;
        if(event.data.type==='mbc-abyss-spotlight'&&event.data.action==='empty') {
            if(frameHost)frameHost.style.display=event.data.empty&&data.settings.spotlightEmpty==='hide'?'none':'block';if(event.data.empty)resetBackdrop();return;
        }
        if(event.data.type==='abyss-spotlight'&&event.data.action==='backdrop-sync')syncBackdrop(event.data.url);
        if(event.data.type==='abyss-spotlight'&&event.data.action==='leave') {
            var focusable=document.querySelector('#indexPage:not(.hide) #homeTab .sections a, #indexPage:not(.hide) #homeTab .sections button');
            if(focusable)focusable.focus();
        }
    }
    function reload() {
        if(request||!running||disposed)return Promise.resolve();
        var controller=new AbortController();request=controller;
        return fetch(new URL('runtime',assetRoot).href,{cache:'no-store',signal:controller.signal}).then(function(response){
            if(response.status===404||response.status===410){dispose();return null;}
            if(!response.ok)throw new Error('Theme settings unavailable');return response.json();
        }).then(function(value){
            if(!value||!running||disposed)return;
            data=value;
            if(fingerprint!==value.token) {
                fingerprint=value.token;fullDashboardBlocked=false;
                var style=document.getElementById('MrBoneCrash-AbyssTheme-v1');
                if(style)style.textContent=value.css;
                document.querySelectorAll('style[data-abyss-override]').forEach(function(node){node.remove();});
                var palette=document.getElementById('MrBoneCrash-AbyssDashboard');
                if(!palette){palette=document.createElement('style');palette.id='MrBoneCrash-AbyssDashboard';document.head.appendChild(palette);}
                palette.textContent=value.dashboardCss;
                removeFrame();restoreOrder();homePrefs=null;homePrefsUser='';
            }
            update();
        }).catch(function(error){if(error.name!=='AbortError')info.spotlight='Settings temporarily unavailable; retaining the loaded theme';}).then(function(){if(request===controller)request=null;});
    }
    function pause() {
        running=false;
        if(timer!==null)clearInterval(timer);timer=null;
        if(scheduled!==null)cancelAnimationFrame(scheduled);scheduled=null;
        if(request)request.abort();request=null;
        if(homeRequest)homeRequest.abort();homeRequest=null;
        observer.disconnect();
        window.removeEventListener('hashchange',schedule);window.removeEventListener('popstate',schedule);window.removeEventListener('resize',schedule);
        document.removeEventListener('visibilitychange',visibility);
        window.removeEventListener('message',message);
        removeFrame();clearDetails();resetBackdrop();restoreOrder();dark(false);
        styles().forEach(function(style){style.media='not all';});
        document.documentElement.removeAttribute('data-mbc-abyss-dashboard');
    }
    function visibility(){if(document.hidden){removeFrame();clearDetails();resetBackdrop();restoreOrder();}else{reload();schedule();}}
    function attach() {
        if(disposed||running)return;running=true;
        window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule);window.addEventListener('resize',schedule);
        window.addEventListener('message',message);document.addEventListener('visibilitychange',visibility);
        observer.observe(document.documentElement,{childList:true,subtree:true});
        timer=setInterval(function(){homePrefs=null;homePrefsUser='';reload();},60000);
        reload();
    }
    function dispose() {
        if(disposed)return;pause();disposed=true;
        window.removeEventListener('pagehide',pause);window.removeEventListener('pageshow',attach);
        var palette=document.getElementById('MrBoneCrash-AbyssDashboard');if(palette)palette.remove();
        delete window[key];
    }
    window[key]={dispose:dispose,reload:reload,getContext:getContext,getStatus:function(){return Object.assign({},info);}};
    window.addEventListener('pagehide',pause);window.addEventListener('pageshow',attach);attach();
})();
