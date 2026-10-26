(function () {
    'use strict';
    var view = document.querySelector('#AbyssThemeConfig');
    if (!view || view.dataset.bound === 'true') return;
    view.dataset.bound = 'true';
    var form = view.querySelector('#abyss-settings'), status = view.querySelector('#abyss-status');
    var saved, defaults, busy = false, dirty = false;
    function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; }
    function field(key, label, type, hint, options) { return { key: key, label: label, type: type || 'checkbox', hint: hint || '', options: options }; }
    function range(key, label, min, max, unit, hint) { return field(key, label, 'range', hint, { min: min, max: max, unit: unit || '' }); }
    var sections = [
        { id: 'appearance', title: 'Appearance', step: '01 / LOOK & FEEL', description: 'Choose a palette, then tune the details. The preview stays local until you save.',
          fields: [field('accent', 'Accent color', 'color'), field('indicatorColor', 'Episode indicator color', 'color'), field('glassTint', 'Glass tint', 'color'),
            range('radius', 'Corner radius', 0, 40, 'px'), field('font', 'Typography', 'select', '', [['google','Google Sans'],['system','System font'],['inter','Inter'],['serif','Georgia']]),
            range('fontScale', 'Interface text scale', 85, 125, '%'), field('externalFonts', 'Load external fonts', null, 'Allow Google Fonts and the upstream icon CDN. Off uses local fallback fonts.'),
            field('liteMode', 'Lite mode', null, 'Reduce blur, shadows and entrance motion. Blur is capped at 12px / 8px in Lite mode.')],
          extra: [{ title: 'Effects & performance', fields: [range('backdropBlur','Backdrop blur',0,40,'px'),range('glassBlur','Glass blur',0,40,'px'),
            field('motion','Motion','select','System motion preferences remain respected.',[['system','Follow system'],['reduced','Reduce all motion'],['full','Allow theme animations']]),
            field('shadows','Surface shadows'),field('hoverEffects','Hover transitions'),field('entranceAnimations','Section entrance animations'),field('heartAnimation','Favorite heart animation')]}] },
        { id: 'layout', title: 'Jellyfin layout', step: '02 / YOUR WEB CLIENT', description: 'Reversible presentation changes. Your saved Jellyfin preferences stay untouched.',
          fields: [field('forceDark','Use Dark while Abyss is active',null,'Temporarily applies the dark palette. Your saved theme preference is restored when Abyss is inactive.'),
            field('showBackdrops','Show content backdrops',null,'Show accessible artwork on detail pages and allow Spotlight home backgrounds. Does not overwrite Jellyfin’s saved backdrop preference.'),
            field('lockThemeSelectors','Lock the theme selectors',null,'Use the upstream CSS lock while Dark is active. Off keeps Jellyfin’s theme controls usable.'),
            field('dashboardStyle','Dashboard styling','select','Safe changes colors only. Full is experimental and automatically falls back if navigation overlaps.',[['off','Jellyfin default'],['safe','Safe Abyss palette'],['full','Full upstream styling (experimental)']]),
            field('reorderHome','Use the recommended home order',null,'Temporarily reorders recognized standard sections; extra plugin sections keep their relative order.')],
          note: 'This configuration page always uses the safe presentation. Layout integrations that cannot be identified are left unchanged.' },
        { id: 'spotlight', title: 'Spotlight', step: '03 / THE HOME BANNER', description: 'Abyss’s own cinematic banner. It does not require Media Bar Enhanced.',
          fields: [field('spotlight','Enable Spotlight'),field('spotlightAutoRotate','Rotate items automatically'),range('spotlightInterval','Rotation interval',3,60,'s'),
            range('spotlightHeight','Desktop banner height',35,90,'vh'),range('spotlightMobileHeight','Mobile banner height',40,100,'vh'),
            range('spotlightLimit','Maximum items',1,12,''),range('spotlightRefresh','Refresh library content',30,600,'s'),
            field('spotlightPauseOnHover','Pause rotation on hover',null,'Keyboard focus also pauses rotation.'),
            field('spotlightEmpty','When there are no items','select','', [['hide','Hide the banner'],['message','Show an empty state']]),
            field('spotlightYieldToOtherBanners','Yield to existing home banners',null,'Avoids duplicating another Spotlight or Media Bar banner.')],
          extra: [{title:'Content sources',open:true,fields:[field('spotlightResume','Continue Watching'),field('spotlightNextUp','Next Up'),field('spotlightMovies','Recently added movies'),field('spotlightSeries','Recently added series')]},
            {title:'Artwork & visible content',fields:[field('spotlightPreferBackdrop','Prefer backdrop artwork',null,'Off prefers primary artwork, with backdrop fallback.'),range('spotlightImageQuality','Artwork quality',50,100,'%'),
              field('spotlightLogo','Show title logos'),field('spotlightOverview','Show plot summary'),field('spotlightMetadata','Show rating and runtime'),field('spotlightProgress','Show resume progress'),
              field('spotlightDots','Show carousel controls'),field('spotlightPlayButton','Show Play / Resume'),field('spotlightInfoButton','Show details button'),
              field('spotlightZoom','Animate artwork'),field('spotlightPageBackdrop','Extend artwork behind the page',null,'Uses a separate owned background layer; existing Jellyfin backdrops are not modified.')]}],
          note:'Uses only the signed-in account’s accessible media. Requires a recognized Web home view. Play/Resume uses an existing Jellyfin action where available; otherwise it opens item details.' },
        { id: 'integrations', title: 'Plugin adaptations', step: '04 / BETTER TOGETHER', description: 'Optional styling for plugins you already use. These switches do not install another plugin.',
          fields:[field('jellyfinEnhanced','Jellyfin Enhanced adaptation',null,'Bundled upstream target: 11.3.0.0.'),field('mediaBarEnhanced','Media Bar Enhanced adaptation',null,'Bundled upstream target: 1.9.0.0.')],
          note:'Adaptations are version specific and may lag plugin updates. Actual installations of these plugins have not been verified here.' },
        { id: 'updates', title: 'Updates', step: '05 / KEEP IT FRESH', description: 'Follow upstream main, with a saved previous bundle when you need it.',
          fields:[field('automaticUpdates','Automatically update Abyss',null,'Off by default. Checks on startup and at the interval below.'),
            range('updateIntervalHours','Update check interval',1,168,'h'),
            field('updateSpotlightCode','Include Spotlight code updates',null,'Off by default. Executes trusted upstream JavaScript from AumGupta’s repository, after integration checks. Otherwise Spotlight code stays at the bundled/previous revision.')],
          note:'Checks use GitHub main, including unreleased changes. Failed downloads or validation keep the active bundle. CSS checks cannot guarantee visual compatibility. Manual checks use saved settings.' }
    ];
    var fields = [field('enabled','Enable Abyss',null,'Pause the theme and Spotlight without uninstalling or losing settings.')];
    function addField(def, container) {
        fields.push(def);
        var box = el('div','abyss-field'), label = el('label'), input = el(def.type === 'select' ? 'select' : 'input');
        input.id = 'abyss-' + def.key; input.dataset.setting = def.key; label.htmlFor = input.id;
        if (def.type !== 'select') input.type = def.type;
        if (def.type === 'select') def.options.forEach(function(option) { var item = el('option','',option[1]); item.value = option[0]; input.appendChild(item); });
        if (def.type === 'range') { input.min = def.options.min; input.max = def.options.max; input.step = '1'; var output = el('output'); output.htmlFor = input.id; output.id = input.id + '-output'; label.appendChild(output); }
        if (def.type === 'checkbox') { label.className = 'abyss-toggle-label'; label.appendChild(input); label.appendChild(el('span','',def.label)); box.appendChild(label); }
        else { label.appendChild(document.createTextNode(def.label)); box.appendChild(label); box.appendChild(input); }
        if (def.hint) { var hint = el('p','',def.hint); hint.id = input.id + '-hint'; input.setAttribute('aria-describedby',hint.id); box.appendChild(hint); }
        container.appendChild(box);
    }
    var master = fields.shift(); addField(master,view.querySelector('#abyss-enabled-control'));
    var sectionHost = view.querySelector('#abyss-config-sections'), nav = view.querySelector('#abyss-section-links');
    sections.forEach(function(section) {
        var card = el('section','abyss-card'); card.id = 'abyss-' + section.id;
        var head = el('div','abyss-section-head'), title = el('div'); title.appendChild(el('span','abyss-step',section.step)); title.appendChild(el('h2','',section.title)); title.appendChild(el('p','',section.description));
        var reset = el('button','abyss-text-button','Reset section'); reset.type = 'button'; reset.dataset.resetSection = section.id; head.appendChild(title); head.appendChild(reset); card.appendChild(head);
        var grid = el('div','abyss-field-grid'); section.fields.forEach(function(def){ addField(def,grid); }); card.appendChild(grid);
        (section.extra || []).forEach(function(extra) { var details = el('details'); details.open = !!extra.open; details.appendChild(el('summary','',extra.title)); var group = el('div','abyss-field-grid'); extra.fields.forEach(function(def){addField(def,group);});details.appendChild(group);card.appendChild(details); });
        if(section.id === 'layout') {
            var order = el('div','abyss-home-order'); order.id='abyss-home-order'; order.appendChild(el('h3','','Home section order')); order.appendChild(el('p','','The four standard sections, in your preferred order. Unknown sections remain in their original relative order.'));
            var choices=[['resume','Continue Watching'],['nextup','Next Up'],['smalllibrarytiles','My Media'],['latestmedia','Recently Added']];
            var rows=el('div','abyss-field-grid');
            for(var i=0;i<4;i++){var row=el('div','abyss-field'),label=el('label','','Position '+(i+1)),select=el('select');select.id='abyss-home-'+i;select.dataset.homeOrder=i;label.htmlFor=select.id;choices.forEach(function(choice){var option=el('option','',choice[1]);option.value=choice[0];select.appendChild(option);});row.appendChild(label);row.appendChild(select);rows.appendChild(row);}order.appendChild(rows);card.appendChild(order);
        }
        if(section.id === 'updates') {var actions=el('div','abyss-actions'),check=el('button','abyss-secondary','Check and apply latest Abyss');check.id='abyss-check';check.type='button';actions.appendChild(check);card.appendChild(actions);}
        if(section.note)card.appendChild(el('p','abyss-note',section.note));
        sectionHost.appendChild(card);
        var link=el('button','',section.title);link.type='button';link.dataset.scroll='abyss-'+section.id;nav.appendChild(link);
    });
    var recovery=el('button','','Recovery');recovery.type='button';recovery.dataset.scroll='abyss-recovery';nav.appendChild(recovery);
    function message(text,error){status.textContent=text;status.dataset.error=error?'true':'false';}
    function request(route,method,data) {
        return ApiClient.ajax({type:method||'GET',url:ApiClient.getUrl('AbyssTheme/'+route),
            data:data===undefined?undefined:JSON.stringify(data),contentType:'application/json',
            dataType:(!method||method==='GET'||route==='check')?'json':undefined});
    }
    function read() {
        var value=Object.assign({},saved.settings);
        fields.forEach(function(def){var input=view.querySelector('#abyss-'+def.key);value[def.key]=def.type==='checkbox'?input.checked:def.type==='range'?Number(input.value):input.value;});
        value.homeOrder=Array.from(view.querySelectorAll('[data-home-order]')).map(function(input){return input.value;});
        return value;
    }
    function preview(value) {
        var card=view.querySelector('#abyss-preview');card.style.setProperty('--preview-accent',value.accent);card.style.setProperty('--preview-radius',value.radius+'px');
        card.style.fontFamily={google:"'Segoe UI',sans-serif",inter:"'Segoe UI',sans-serif",system:'system-ui,sans-serif',serif:'Georgia,serif'}[value.font];
        card.style.opacity=value.enabled?'1':'.45';
        view.querySelector('#abyss-home-order').hidden=!value.reorderHome;
        fields.forEach(function(def){if(def.type==='range')view.querySelector('#abyss-'+def.key+'-output').textContent=value[def.key]+def.options.unit;});
    }
    function paint(value) {fields.forEach(function(def){var input=view.querySelector('#abyss-'+def.key);if(def.type==='checkbox')input.checked=value[def.key];else input.value=value[def.key];});view.querySelectorAll('[data-home-order]').forEach(function(input){input.value=value.homeOrder[Number(input.dataset.homeOrder)];});preview(value);}
    function changed() {if(!saved)return;var value=read();dirty=JSON.stringify(value)!==JSON.stringify(saved.settings);view.querySelector('#abyss-dirty').textContent=dirty?'Unsaved changes · preview only':'No unsaved changes';preview(value);}
    function load() {return request('status').then(function(data) {
        saved=data;defaults=data.defaults;paint(data.settings);dirty=false;view.querySelector('#abyss-dirty').textContent='No unsaved changes';
        view.querySelector('#abyss-css-revision').textContent=data.revision.slice(0,12);
        view.querySelector('#abyss-code-revision').textContent=(data.spotlightRevision||data.bundledRevision).slice(0,12);
        view.querySelector('#abyss-last-check').textContent=data.lastChecked?new Date(data.lastChecked).toLocaleString():'Not checked yet';
        var warning=data.error||(!data.integrationReady?'File Transformation 3.x is not ready. Install or enable it, restart Jellyfin, then reload this page.':null);
        message(warning||'Ready. Saved changes apply to compatible Web clients within a minute or on reload.',!!warning);view.dataset.ready='true';
    });}
    function perform(action,success) {
        if(busy)return;busy=true;view.dataset.busy='true';
        form.querySelectorAll('button,input,select').forEach(function(node){node.disabled=true;});message('Working…');
        Promise.resolve().then(action).then(load).then(function(){
            var runtime=window.__MrBoneCrashAbyssThemeV1;
            return runtime&&runtime.reload?runtime.reload():undefined;
        }).then(function(){
            if(success&&!saved.error&&saved.integrationReady)message(success);
            var runtime=window.__MrBoneCrashAbyssThemeV1, hint=view.querySelector('#abyss-runtime-hint');
            if(!hint){hint=el('p');hint.id='abyss-runtime-hint';view.querySelector('.abyss-support').appendChild(hint);}
            hint.textContent=runtime&&runtime.getStatus?'Current view · Dashboard: '+runtime.getStatus().dashboard+'.':'The Web integration is not loaded in this client. Reload a compatible server-hosted Web client to apply Abyss.';
        }).catch(function(error){
            var detail=error&&error.responseJSON&&error.responseJSON.message;
            if(!detail&&error&&error.responseText){try{detail=JSON.parse(error.responseText).message;}catch(ignore){}}
            message(detail||'The request failed. Check administrator access, server availability and logs, then retry.',true);
        }).then(function(){busy=false;view.dataset.busy='false';form.querySelectorAll('button,input,select').forEach(function(node){node.disabled=false;});});
    }
    form.addEventListener('input',changed);form.addEventListener('change',changed);
    form.addEventListener('submit',function(event){
        event.preventDefault();if(!saved||busy)return;if(!form.reportValidity())return;
        var value=read();if(new Set(value.homeOrder).size!==4){message('Choose each home section exactly once.',true);return;}
        if(value.spotlight&&!(value.spotlightResume||value.spotlightNextUp||value.spotlightMovies||value.spotlightSeries)){message('Select at least one Spotlight content source.',true);return;}
        perform(function(){return request('settings','PUT',value);},'Settings saved. Reload clients for immediate application.');
    });
    view.addEventListener('click',function(event){
        var target=event.target.closest('[data-scroll],[data-reset-section],#abyss-check,#abyss-rollback,#abyss-reset');if(!target)return;
        if(target.dataset.scroll){event.preventDefault();view.querySelector('#'+target.dataset.scroll).scrollIntoView({block:'start',behavior:'auto'});return;}
        if(target.dataset.resetSection&&saved&&!busy){
            var section=sections.find(function(item){return item.id===target.dataset.resetSection;}),value=read();
            section.fields.concat.apply(section.fields,(section.extra||[]).map(function(extra){return extra.fields;})).forEach(function(def){value[def.key]=defaults[def.key];});
            if(section.id==='layout')value.homeOrder=defaults.homeOrder.slice();
            paint(value);changed();message('Section defaults previewed. Save settings to apply.');return;
        }
        if(target.id==='abyss-check'){if(dirty){message('Save your changes before checking for updates.',true);return;}perform(function(){return request('check','POST');});}
        if(target.id==='abyss-rollback')perform(function(){return request('rollback','POST');},'Previous theme restored. Automatic updates are off.');
        if(target.id==='abyss-reset')perform(function(){return request('reset','POST');},'Bundled assets and default settings restored.');
    });
    view.addEventListener('viewshow',function(){if(!dirty)perform(load);});
    perform(load);
})();
