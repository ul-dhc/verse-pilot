'use strict';
const DATA=window.VERSE_DATA.records, $=s=>document.querySelector(s);
const evidenceById=new Map((window.VERSE_DATA.evidence||[]).map(e=>[e.evidence_id,e]));
const collections={LV:'Latvian',NO:'Norwegian',FI:'Finnish',SE:'Swedish'};
const modeNames={vision:'Vision',hearing:'Hearing',body:'Bodily experience',smell:'Smell',taste:'Taste',orientation:'Orientation / space',other:'Other perception'};
const langs={LV:'lv',NO:'no',FI:'fi',SE:'sv'};
let map,mapReady=false,mapScope=null,markers,baseTiles;
const collectionColours={LV:'#b6a3cc',NO:'#97bcae',FI:'#d6b796',SE:'#9ebacf'};
const sensoryColours={vision:'#d9ba48',hearing:'#4b9fff',body:'#dc94b2',smell:'#d9a877',taste:'#4fd1bd',orientation:'#b19add',other:'#25bfd3'};
const sensoryPalettes={dark:{...sensoryColours},light:{vision:'#887018',hearing:'#2169bf',body:'#ae648a',smell:'#956e37',taste:'#087d70',orientation:'#7955aa',other:'#087c90'}};
let mapView='senses',countryLayer,selectedEvent=null;
let densitySort='density',densityShowAll=true,densitySelected=null;
document.addEventListener('click',ev=>{if(densitySelected&&!ev.target.closest('.density-list')){densitySelected=null;document.querySelector('.density-list')?.classList.remove('has-selection');document.querySelectorAll('.density-row.is-selected').forEach(row=>{row.classList.remove('is-selected');row.setAttribute('aria-pressed','false')});const caption=document.querySelector('.density-caption');if(caption){caption.querySelector('strong').textContent='Explore the weave';caption.querySelector('span').textContent='Hover or focus a strand to inspect a narrative · click to read'}}},true);
let configModes=new Set(Object.keys(modeNames)),eventMarks='events',researchView='comparison',flowSelected=null;
let selected='LV:130801007',tab='original',highlight=true,filtered=DATA;
let showResponses=false,showCandidates=false;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function tone(node,g){node.style.setProperty('--tone',`var(--${g})`);return node}
function chip(text,g){return tone(el('span','chip',text),g||'other')}
function button(text,action){const b=el('button','',text);b.type='button';b.onclick=action;return b}
function check(container,value,label,count,group){const l=el('label','check'),i=el('input');i.type='checkbox';i.value=value;i.name=group;i.onchange=()=>{mapScope=null;update()};l.append(i);if(group==='mode')l.append(tone(el('span','dot'),value));l.append(document.createTextNode(label));if(count!==undefined)l.append(el('span','count',count));container.append(l)}
Object.entries(collections).forEach(([k,v])=>check($('#collections'),k,v,150,'collection'));
Object.entries(modeNames).forEach(([k,v])=>check($('#modes'),k,v,undefined,'mode'));
function legend(parent){const l=el('div','legend');Object.entries(modeNames).forEach(([g,name])=>{const s=el('span');s.append(tone(el('i','dot'),g),document.createTextNode(name));l.append(s)});parent.append(l)}
function defaultSensorySelection(){return $('#config-match').value==='any'&&configModes.size===Object.keys(modeNames).length}
function resetSensorySelection(){configModes=new Set(Object.keys(modeNames));$('#config-match').value='any'}
function applyFilters(ignoreCollection=false){const cs=[...document.querySelectorAll('[name=collection]:checked')].map(x=>x.value),ms=[...document.querySelectorAll('[name=mode]:checked')].map(x=>x.value),q=$('#search').value.toLocaleLowerCase().trim(),u=$('#uncertainty').value;return DATA.filter(r=>(ignoreCollection||!cs.length||cs.includes(r.collection))&&(!ms.length||r.groups.some(g=>ms.includes(g)))&&(!$('#translated').checked||r.translation)&&(!q||`${r.id} ${r.title} ${r.text} ${r.translation}`.toLocaleLowerCase().includes(q))&&(!u||(u==='none'?!r.events.some(e=>['yes','unclear'].includes(e.uncertainty)):r.events.some(e=>e.uncertainty===u)))&&(defaultSensorySelection()||matchingEvents(r).length>0))}
function update(){const candidates=applyFilters();filtered=mapScope==='unmapped'?candidates.filter(r=>!r.locations.length):mapScope instanceof Set?candidates.filter(r=>mapScope.has(r.key)):candidates;if(!filtered.some(r=>r.key===selected))selected=filtered[0]?.key;renderReader();if(mapReady)renderMap(candidates);renderConfigurations();renderActiveFilters()}
function annotationSpans(e){return e.spans||[{start:e.start,end:e.end,span:e.span}]}
function eventInfo(parent,events){
 parent.replaceChildren();parent.hidden=false;
 for(const e of events){
  const item=el('div'),response=e.type==='response',candidate=e.type==='candidate';
  item.append(el('p','eyebrow',`${response?'Response':candidate?'Unresolved candidate':'Sensory event'} · ${e.id}`));
  if(response)item.append(el('strong','',e.label));
  for(const s of annotationSpans(e))item.append(el('blockquote','',s.span));
  if(response){
   item.append(el('p','',`Roles: ${e.roles.join(', ')}`),el('p','',e.event_ids.length?`Event link: ${e.link_status} · ${e.event_ids.join(', ')}`:'Unassigned response candidate · no confirmed sensory-event link'),el('p','',e.explanation));
   if(e.notes)item.append(el('p','',e.notes));
  }else{
   const chips=el('div','chips');e.modalities.forEach(m=>chips.append(chip(m,e.groups[0])));item.append(chips);
   item.append(el('p','',`Perceptual status: ${e.polarity}`),el('p','',`Narrated uncertainty: ${e.uncertainty==='no'?'not stated':e.uncertaintyType}`));
   if(candidate)item.append(el('p','hint','Excluded from map points, graphs and sensory-event counts.'));
   if(e.evidence)item.append(el('p','',`Uncertainty evidence: ${e.evidence}`));
   if(e.note)item.append(el('p','',e.note));
   if(Object.keys(e.context||{}).length){const dl=el('dl');for(const [k,v] of Object.entries(e.context))dl.append(el('dt','',k.replaceAll('_',' ')),el('dd','',v));item.append(dl)}
  }
  if(e.gloss)item.append(el('p','hint',`Working gloss: ${e.gloss}`));
  const ids=e.evidenceIds||[...(e.evidence_ids||[]),...(e.link_evidence_ids||[])],proofs=ids.map(id=>evidenceById.get(id)).filter(Boolean);
  if(proofs.length){const d=el('details');d.append(el('summary','', 'Supporting evidence'));for(const proof of proofs)d.append(el('p','hint',`${proof.field.replaceAll('_',' ')} · ${proof.start_codepoint}–${proof.end_codepoint_exclusive}`),el('blockquote','',proof.quote));item.append(d)}
  parent.append(item);
 }
}
function annotationLayers(r,parent){
 const nr=(r.responses||[]).length,nc=(r.candidates||[]).length;if(!nr&&!nc)return;
 const d=el('details','annotation-layers');d.open=showResponses||showCandidates;
 d.append(el('summary','',`Additional annotations · ${nr} responses · ${nc} candidates`),el('p','hint','Optional original-text layers, excluded from sensory-event counts. Dashed passages are unresolved candidates; underlined passages are responses. Response links may be supported, ambiguous or unassigned.'));
 for(const [id,label,count,checked,set] of [['show-responses','Show response passages',nr,showResponses,v=>showResponses=v],['show-candidates','Show candidate passages',nc,showCandidates,v=>showCandidates=v]]){
  const l=el('label','check'),input=el('input');input.type='checkbox';input.id=id;input.checked=checked;input.disabled=!count;input.onchange=()=>{set(input.checked);renderReader()};l.append(input,document.createTextNode(`${label} (${count})`));d.append(l);
 }parent.append(d);
}
function original(r,parent,isTranslation=false){
 const text=el('div','narrative');text.lang=isTranslation?'en':langs[r.collection];
 const content=isTranslation?r.translation:r.text,eventList=isTranslation?(r.translationEvents||[]):[...r.events,...(showCandidates?r.candidates||[]:[]),...(showResponses?r.responses||[]:[])];
 const info=el('div','annotation');info.hidden=true;const points=Array.from(content);
 const ranges=eventList.flatMap(e=>annotationSpans(e).map(s=>({...s,event:e})));
 const boundaries=[...new Set([0,points.length,...ranges.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 for(let i=0;i<boundaries.length-1;i++){
  const a=boundaries[i],b=boundaries[i+1],segment=points.slice(a,b).join('');
  const events=[...new Map(ranges.filter(s=>s.start<=a&&s.end>=b).map(s=>[s.event.id,s.event])).values()];
  if(!events.length||!highlight){text.append(document.createTextNode(segment));continue}
  const sensory=events.filter(e=>e.type==='conservative'),modes=[...new Set(sensory.flatMap(e=>e.groups))],mark=el('mark',modes.length>1?'multi':'',segment);
  if(modes.length){tone(mark,modes[0]);if(modes[1])mark.style.setProperty('--tone2',`var(--${modes[1]})`)}else mark.classList.add('auxiliary-mark');
  if(events.some(e=>e.type==='candidate'))mark.classList.add('candidate-mark');
  if(events.some(e=>e.type==='response'))mark.classList.add('response-mark');
  if(selectedEvent?.r.key===r.key&&events.some(e=>e.id===selectedEvent.e.id))mark.classList.add('chosen');
  mark.dataset.record=r.key;mark.dataset.eventIds=events.map(e=>e.id).join(' ');mark.tabIndex=0;mark.setAttribute('role','button');
  const labels=[...modes.map(g=>modeNames[g]),...(events.some(e=>e.type==='response')?['Response']:[]),...(events.some(e=>e.type==='candidate')?['Candidate']:[])];
  mark.setAttribute('aria-label',`${labels.join(', ')}: ${segment}. Inspect annotation`);
  function select(){
   const ids=events.map(e=>e.id),main=r.events.find(e=>ids.includes(e.id));selectedEvent=main?{r,e:main}:null;
   document.querySelectorAll('mark[data-event-ids]').forEach(m=>{if(m.dataset.record===r.key)m.classList.toggle('chosen',m.dataset.eventIds.split(' ').some(id=>ids.includes(id)))});
   eventInfo(info,events.map(e=>isTranslation?r.events.find(source=>source.id===e.id):e));info.scrollIntoView({behavior:'smooth',block:'nearest'});
  }mark.onclick=select;mark.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}};text.append(mark);
 }parent.append(text,info);
}
function translation(r,parent){
 if(!r.translation)return;
 const section=el('section','translation-block');section.setAttribute('aria-label','English translation');section.append(el('h3','language-heading','English translation'),el('p','hint translation-status',`Working translation · Not reviewed by a human. ${r.translationAlignedEvents===r.events.length?'Sensory highlights are provisionally aligned with the original annotations.':'Some sensory highlights are not yet aligned with the original annotations.'}`));
 original(r,section,true);
 if(r.translationNotes.length){const d=el('details');d.append(el('summary','', 'Translator notes'));r.translationNotes.forEach(n=>d.append(el('p','',n)));section.append(d)}parent.append(section);
}

function contexts(r,parent){const section=el('div','context');section.append(el('h3','', 'Narrative context'));const dl=el('dl');for(const [k,label] of [['place','Place'],['time','Time'],['movement','Movement']]){dl.append(el('dt','',label),el('dd','',r.context[k]||'Not coded'))}section.append(dl,el('p','hint','Contexts recorded for sensory events. Event details show their supporting evidence.'));parent.append(section)}
function source(r,parent){parent.append(el('h3','', 'Source reference'),el('p','',r.source||'No source reference supplied for this record.'),el('p','',`Record: ${r.id} · ${collections[r.collection]}`),el('p','',`Source category: ${r.category||'Not supplied'}`));for(const loc of r.locations||[])parent.append(el('p','',`Map: ${loc.label} · ${loc.precision}. ${loc.provenance}`));if(r.place)parent.append(el('p','',`Collection place: ${r.place}`));if(r.annotationNote)parent.append(el('p','',`Annotation note: ${r.annotationNote}`));parent.append(el('p','hint','Source categories and collection places are metadata, not inferred narrative identities or event locations.'))}
function renderReader(){renderMetadata();const parent=$('#reader');parent.replaceChildren();const r=DATA.find(x=>x.key===selected);if(!r){parent.append(el('p','empty','Select different filters to browse the collection.'));return}const top=el('div','reader-top');top.append(el('p','eyebrow',`${collections[r.collection].toUpperCase()} COLLECTION · ${r.id}`));parent.append(top,el('h1','',r.title),el('div','reader-meta',`${r.events.length} sensory events · ${r.translation?'English translation available':'Original language'}`));const chips=el('div','chips');r.groups.forEach(g=>chips.append(chip(modeNames[g],g)));parent.append(chips);const tabs=el('div','tabs');for(const [id,label] of [['original','Text'],['source','Source information']]){const b=button(label,()=>{tab=id;renderReader()});b.className=tab===id?'active':'';b.setAttribute('aria-pressed',String(tab===id));tabs.append(b)}parent.append(tabs);if(tab==='original'){const row=el('div','toggle-row');row.append(el('span','hint','Select a highlighted passage to inspect its annotation.'));const label=el('label'),input=el('input');input.type='checkbox';input.checked=highlight;input.onchange=()=>{highlight=input.checked;renderReader()};label.append(input,document.createTextNode('Highlight'));row.append(label);parent.append(row);annotationLayers(r,parent);legend(parent);parent.append(el('h3','language-heading','Original'));original(r,parent);translation(r,parent);contexts(r,parent)}else if(tab==='english')translation(r,parent);else source(r,parent)}
$('#search').oninput=()=>{mapScope=null;update()};$('#uncertainty').onchange=$('#translated').onchange=()=>{mapScope=null;update()};$('#reset').onclick=clearAllFilters;$('#browse').onclick=()=>{$('#corpus-map').scrollIntoView({behavior:'smooth',block:'center'});if(mapReady)map.invalidateSize()};$('#about').onclick=()=>$('#about-dialog').showModal();$('#close-about').onclick=()=>$('#about-dialog').close();initConfigurations();initMap();update();

$("#corpus-summary").textContent = `${DATA.length} narratives · ${new Set(DATA.map(r=>r.collection)).size} collections · ${DATA.filter(r=>r.translation).length} English translations`;
function initMap(){
 if(!window.L){$('#map-status').textContent='Map library unavailable. All texts remain available below.';return}
 map=L.map('corpus-map',{scrollWheelZoom:true,minZoom:3,maxZoom:14,zoomSnap:.25,zoomControl:true}).setView([62,19],innerWidth>1150?4.25:3.5);
 countryLayer=L.geoJSON(window.VERSE_COUNTRIES,{style:{color:'#263343',weight:.65,fillColor:'#142030',fillOpacity:1},interactive:false,smoothFactor:.5}).addTo(map);
 map.attributionControl.addAttribution('Overview: <a href="https://www.naturalearthdata.com/">Natural Earth</a>');
 for(const [name,lat,lon] of [['NORWAY',65,10],['SWEDEN',63,16],['FINLAND',65,26],['LATVIA',56.6,24.8],['ESTONIA',59,25],['BALTIC SEA',57.7,19]])L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'country-label',html:name,iconSize:[90,20]})}).addTo(map);
 markers=L.layerGroup().addTo(map);mapReady=true;
 document.querySelectorAll('[data-map-view]').forEach(b=>b.onclick=()=>{mapView=b.dataset.mapView;renderMap(applyFilters())});
 $('#map-palette').onchange=()=>{const palette=$('#map-palette').value;Object.assign(sensoryColours,palette==='dark'?sensoryPalettes.dark:sensoryPalettes.light);document.querySelectorAll('#config-modes button').forEach(b=>b.style.setProperty('--mode-colour',sensoryColours[b.dataset.mode]));$('#corpus-map').classList.toggle('paper',palette==='paper');$('#corpus-map').classList.toggle('night',palette==='dark');$('#configuration').classList.toggle('night',palette==='dark');countryLayer.setStyle({fillColor:palette==='dark'?'#142030':palette==='paper'?'#f6f1e7':'#f1f3ee',color:palette==='dark'?'#263343':palette==='paper'?'#d7cfc0':'#cad5d2'});if(mapReady){renderMap(applyFilters());renderConfigurations()}};
 $('#map-palette').onchange();
 $('#event-marks').onchange=()=>{eventMarks=$('#event-marks').value;renderMap(applyFilters())};
 $('#heat-intensity').oninput=()=>{$('#heat-intensity-value').textContent=$('#heat-intensity').value+'%';renderMap(applyFilters())};
 $('#heat-radius').oninput=()=>{const value=$('#heat-radius').value;$('#heat-radius-value').textContent=value+' px';$('#heat-radius').setAttribute('aria-valuetext',value+' pixels');renderMap(applyFilters())};
 $('#event-spread').oninput=()=>renderMap(applyFilters());
 map.on('zoomend moveend',()=>renderMap(applyFilters()));
 map.on('click',ev=>{
  // Marker clicks can bubble to the map after their layers have been redrawn.
  if(ev.originalEvent?.target.closest('.leaflet-interactive,.leaflet-marker-icon,.leaflet-control'))return;
  if(!selectedEvent&&!flowSelected&&!densitySelected&&!(mapScope instanceof Set))return;
  selectedEvent=null;flowSelected=null;densitySelected=null;
  if(mapScope instanceof Set){mapScope=null}
  update();
 });
 $('#fit-map').onclick=()=>{const records=applyFilters(),pts=records.flatMap(r=>r.locations.map(l=>[l.lat,l.lon]));if(mapView==='senses'&&eventMarks==='events')for(const group of eventMapLayout(records))for(const entry of group.entries)pts.push(entry.position);if(pts.length)map.fitBounds(pts,{padding:[35,35],maxZoom:9})};
 $('#all-locations').onclick=()=>{mapScope=null;update()};
 $('#unmapped').onclick=()=>{mapScope='unmapped';update()};
 $('#detailed-map').onchange=()=>{if($('#detailed-map').checked){if(location.protocol==='file:'){$('#detailed-map').checked=false;$('#map-status').textContent='The detailed basemap is available in the local preview or on GitHub Pages. The overview works offline.';return}baseTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);baseTiles.on('tileerror',()=>{$('#map-status').textContent='Detailed tiles could not load. Turn off the detailed basemap to use the built-in overview.'})}else if(baseTiles)map.removeLayer(baseTiles)};
}
function renderMap(records){
 $('.heat-controls').hidden=mapView!=='density';
 records=mapScope==='unmapped'?records.filter(r=>!r.locations.length):mapScope instanceof Set?records.filter(r=>mapScope.has(r.key)):records;
 if(!defaultSensorySelection())records=records.filter(r=>matchingEvents(r).length);
 markers.clearLayers();const collectionFocus=!!document.querySelector('[name=collection]:checked')||mapScope instanceof Set;$('#corpus-map').classList.toggle('collection-focus',collectionFocus);if(collectionFocus&&mapView!=='density'&&mapScope!=='unmapped'){const selectedKeys=new Set(records.map(r=>r.key));renderEventMap(applyFilters(true).filter(r=>!selectedKeys.has(r.key)),true)}const mapped=records.filter(r=>r.locations.length);$('#map-count').textContent=`${mapped.length} mapped · ${records.length-mapped.length} without coordinates`;
 $('#all-locations').classList.toggle('active',mapScope===null);$('#unmapped').classList.toggle('active',mapScope==='unmapped');
 $('#map-status').textContent=mapScope==='unmapped'?'Showing narratives without coordinates.':mapScope instanceof Set?`Showing ${filtered.length} narratives from the selected marker. Choose All locations to clear.`:'Select a marker to explore its narratives.';if(collectionFocus&&mapView!=='density')$('#map-status').textContent+=' Other collections remain faintly visible for context; counts describe the selection.';
 document.querySelectorAll('[data-map-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapView===mapView)));
 const legend=$('#map-legend');legend.replaceChildren();
 const legendData=mapView==='senses'?Object.entries(modeNames).map(([k,v])=>[v,sensoryColours[k]]):mapView==='density'?[['Fewer records','#dce0e8'],['More records','#a49dba']]:Object.entries(collections).map(([k,v])=>[v,collectionColours[k]]);
 for(const [name,colour] of legendData){const item=el('span'),dot=el('b');dot.style.background=colour;item.append(dot,document.createTextNode(name));legend.append(item)}
 $('#map-explanation').textContent={collections:'Colour shows collection; size and number show narrative count. Dashed edges indicate approximate or regional references.',senses:'Rings show the sensory mix: each narrative contributes once to every mode it contains. Centre numbers count narratives, not events. Grey means no included sensory mode.',density:'Soft halos show relative record concentration at this zoom, not sensory intensity or population prevalence. Counts include records sharing approximate locality references.'}[mapView]+' Source places are not necessarily story locations.';
 $('.event-map-controls').hidden=mapView!=='senses';
 if(mapView==='senses'&&eventMarks==='events'){renderEventMap(records);return}
 if(mapView==='density'){renderEventConcentration(records);return}
 const cells=new Map();for(const r of mapped)for(const loc of r.locations){const point=map.project([loc.lat,loc.lon],map.getZoom());let cell=[...cells.values()].find(items=>items[0].point.distanceTo(point)<44);if(!cell){cell=[];cells.set(cells.size,cell)}cell.push({r,loc,point})}
 const maxCount=Math.max(1,...[...cells.values()].map(items=>new Set(items.map(i=>i.r.key)).size));
 for(const items of cells.values()){
  const unique=[...new Map(items.map(i=>[i.r.key,i.r])).values()],count=unique.length,lat=items.reduce((n,i)=>n+i.loc.lat,0)/items.length,lon=items.reduce((n,i)=>n+i.loc.lon,0)/items.length;
  const approx=items.some(i=>i.loc.precision!=='source place'),isSelected=unique.some(r=>r.key===selectedEvent?.r.key||(mapScope instanceof Set&&mapScope.has(r.key)));
  const cs=[...new Set(unique.map(r=>r.collection))];
  const tally=mapView==='senses'?Object.keys(modeNames).map(g=>[g,unique.filter(r=>r.groups.includes(g)).length]).filter(x=>x[1]):cs.map(c=>[c,unique.filter(r=>r.collection===c).length]);
  const total=tally.reduce((n,x)=>n+x[1],0);let offset=0;
  const segments=tally.map(([key,n])=>{const start=offset;offset+=100*n/total;return `${mapView==='senses'?sensoryColours[key]:collectionColours[key]} ${start}% ${offset}%`});
  const colour=mapView==='density'?'#b2abc5':tally.length===1?(mapView==='senses'?sensoryColours[tally[0][0]]:collectionColours[tally[0][0]]):'#bac5c8';
  const fill=segments.length>1?`conic-gradient(${segments.join(',')})`:colour;
  const size=mapView==='density'?Math.round(42+54*Math.sqrt(count/maxCount)):count===1?16:Math.round(24+Math.min(18,Math.sqrt(count)*1.6));
  const html=`<span class="ambient-marker ${mapView}${approx?' approximate':''}${isSelected?' selected':''}" style="--marker:${colour};--size:${size}px;--ring:${fill};--strength:${.2+.4*Math.sqrt(count/maxCount)}"><span class="marker-core">${count>1||mapView==='density'?count:''}</span></span>`;
  const marker=L.marker([lat,lon],{icon:L.divIcon({className:'map-marker',html,iconSize:[size,size],iconAnchor:[size/2,size/2]}),title:`${count} narrative${count===1?'':'s'} · ${cs.map(c=>collections[c]).join(', ')}${approx?' · approximate / regional':''}`,keyboard:true}).addTo(markers);
  const tip=el('div');tip.append(el('strong','',`${count} narrative${count===1?'':'s'}`),el('div','',[...new Set(items.map(i=>i.loc.label))].slice(0,3).join(', ')));
  if(mapView==='senses')tip.append(el('div','',tally.map(([g,n])=>`${modeNames[g]} ${n}`).join(' · ')));
  if(approx)tip.append(el('div','', 'Approximate / regional reference'));
  marker.getElement().setAttribute('aria-label',marker.options.title);marker.getElement().removeAttribute('title');marker.bindTooltip(tip);marker.on('click',()=>{mapScope=new Set(unique.map(r=>r.key));selected=unique[0].key;update()});
 }
}
// Event units are never duplicated across locations in the event visualisations.
function matchingEvents(r){
 const modes=[...document.querySelectorAll('[name=mode]:checked')].map(i=>i.value),u=$('#uncertainty').value;
 return r.events.filter(e=>(!modes.length||e.groups.some(g=>modes.includes(g)))&&(!['yes','unclear'].includes(u)||e.uncertainty===u)&&(configModes.size>0&&($('#config-match').value==='any'?[...configModes].some(g=>e.groups.includes(g)):([...configModes].every(g=>e.groups.includes(g))&&($('#config-match').value!=='exact'||e.groups.length===configModes.size)))));
}
function eventEntries(records){return records.flatMap(r=>matchingEvents(r).map(e=>({r,e})))}
function eventColour(e){return sensoryColours[e.groups[0]]||sensoryColours.other}
function eventGradient(e){const gs=e.groups;return gs.length<2?eventColour(e):`conic-gradient(${gs.map((g,i)=>`${sensoryColours[g]} ${i*100/gs.length}% ${(i+1)*100/gs.length}%`).join(',')})`}
function chooseEvent(r,e){
 selected=r.key;selectedEvent={r,e};tab='original';highlight=true;
 if(!filtered.some(x=>x.key===r.key)){mapScope=null;update()}
 renderConfigurations();renderReader();showInspection('reader');if(mapReady)renderMap(applyFilters());renderActiveFilters();
 const info=$('#reader .annotation');if(info)eventInfo(info,[e]);
 requestAnimationFrame(()=>{const passage=$('#reader mark.chosen');if(passage){passage.focus({preventScroll:true});passage.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})}});
}

function eventMapGroups(records){const groups=new Map();for(const entry of eventEntries(records)){const loc=entry.r.locations[0];if(!loc)continue;const key=`${loc.lat},${loc.lon}`;if(!groups.has(key))groups.set(key,{loc,entries:[]});groups.get(key).entries.push(entry)}return [...groups.values()]}
// Fix the visual spread in projected coordinates at the overview zoom. Rebuilding
// screen-pixel offsets after zooming makes dots snap back and move away from the cursor.
function eventMapLayout(records){
 const referenceZoom=4.25,spread=Number($('#event-spread').value),golden=Math.PI*(3-Math.sqrt(5));
 return eventMapGroups(records).map(({loc,entries})=>{
  const origin=map.project([loc.lat,loc.lon],referenceZoom);
  entries.sort((a,b)=>(a.r.key+a.e.id).localeCompare(b.r.key+b.e.id));
  return {loc,entries:entries.map((entry,i)=>{
   const radius=entries.length===1?12:12+spread*2.8*Math.sqrt(i+1),angle=i*golden;
   return {...entry,position:map.unproject(L.point(origin.x+Math.cos(angle)*radius,origin.y+Math.sin(angle)*radius),referenceZoom)};
  })};
 });
}
function renderEventMap(records,background=false){
 const all=eventEntries(records),groups=eventMapLayout(records),mappedCount=groups.reduce((n,g)=>n+g.entries.length,0);
 if(!background)$('#map-count').textContent=`${mappedCount} mapped events · ${all.length-mappedCount} without coordinates`;
 if(!background)$('#map-explanation').textContent='One dot = one sensory event. Fine spokes lead to its source-place anchor; spread is visual, not geographic. Multicoloured dots have multiple modes. Select a dot to read its passage; select a place ring to explore its events. Click an empty area of the map to clear the selection.';
 const dotSize=Math.min(14,7+Math.max(0,map.getZoom()-4.25)*1.2),hitSize=Math.max(18,dotSize+8);
 for(const {loc,entries} of groups){
  entries.forEach(({r,e,position})=>{const colour=eventColour(e);
   L.polyline([[loc.lat,loc.lon],position],{color:colour,weight:.75,opacity:background?.06:.38,interactive:false}).addTo(markers);
   const dot=L.marker(position,{icon:L.divIcon({className:'event-map-dot'+(background?' map-context-dot':''),html:`<span style="background:${eventGradient(e)};width:${dotSize}px;height:${dotSize}px"></span>`,iconSize:[hitSize,hitSize],iconAnchor:[hitSize/2,hitSize/2]}),keyboard:!background,interactive:!background,opacity:background?.24:1,title:`${e.id} · ${e.modalities.join(', ')}`}).addTo(markers);
   if(background){dot.getElement().removeAttribute('title');dot.getElement().setAttribute('aria-hidden','true');return}
   const isSelected=selectedEvent?.r.key===r.key&&selectedEvent?.e.id===e.id;
   dot.getElement().classList.toggle('is-selected',isSelected);dot.getElement().setAttribute('aria-pressed',String(isSelected));
   dot.getElement().removeAttribute('title');dot.getElement().setAttribute('aria-label',`${e.id} · ${e.modalities.join(', ')} · ${loc.label}. Open passage`);
   const eventTip=el('div','map-event-tip');eventTip.append(el('strong','',e.modalities.join(' · ')),el('span','map-tip-place',loc.label),el('span','map-tip-id',e.id));dot.bindTooltip(eventTip,{direction:'top',offset:[0,-8],className:'event-tooltip'});dot.on('click',()=>chooseEvent(r,e));dot.getElement().addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();chooseEvent(r,e)}});
  });
  if(background)continue;
  const anchor=L.circleMarker([loc.lat,loc.lon],{radius:5,color:'#7ca99f',weight:1.5,fillColor:$('#map-palette').value==='dark'?'#0c1523':'#f7faf7',fillOpacity:1,dashArray:loc.precision==='source place'?null:'2 2'}).addTo(markers);
  anchor.bindTooltip(el('span','',`${loc.label} · ${entries.length} events${loc.precision==='source place'?'':' · approximate / regional'}`));anchor.on('click',()=>{mapScope=new Set(entries.map(x=>x.r.key));update();showInspection('config')});
 }
}
function renderEventConcentration(records){
 const all=eventEntries(records),mapped=all.filter(x=>x.r.locations.length),sourceGroups=eventMapGroups(records);
 const cells=new Map(sourceGroups.map((group,i)=>[i,group]));
 const dark=$('#map-palette').value==='dark',radius=Number($('#heat-radius').value);
 const legend=$('#map-legend');legend.replaceChildren(el('strong','','Sensory layers'));for(const [g,name] of Object.entries(modeNames)){const item=button(name,()=>{configModes=new Set([g]);$('#config-match').value='any';update()});const swatch=el('b');swatch.style.background=sensoryColours[g];item.prepend(swatch);item.className='heat-category';item.setAttribute('aria-pressed',String(configModes.size===1&&configModes.has(g)));legend.append(item)}legend.append(button('All modes',()=>{resetSensorySelection();update()}));
 $('#map-count').textContent=`${mapped.length} mapped events · ${all.length-mapped.length} without coordinates`;
 $('#map-explanation').textContent=`Soft colour fields follow supplied source coordinates. Hue shows the strongest local sensory category; brightness shows coded event concentration. Nearby locations blend within a ${radius}-pixel smoothing radius. Radius adjusts visual blending, not geographic distance or coordinate accuracy. Select a category to inspect its layer. Approximate source places remain approximate.`;
 const dimensions=map.getSize(),heat=document.createElement('canvas');heat.width=dimensions.x;heat.height=dimensions.y;
 const ctx=heat.getContext('2d'),modes=Object.keys(modeNames),fields=modes.map(()=>new Float32Array(heat.width*heat.height)),intensity=Number($('#heat-intensity').value)/100;
 for(const {loc,entries} of sourceGroups){
  const point=map.latLngToContainerPoint([loc.lat,loc.lon]),weights=modes.map(g=>entries.filter(x=>x.e.groups.includes(g)).length);
  for(let y=Math.max(0,Math.floor(point.y-radius));y<Math.min(heat.height,point.y+radius);y++)for(let x=Math.max(0,Math.floor(point.x-radius));x<Math.min(heat.width,point.x+radius);x++){
   const distance=Math.hypot(x-point.x,y-point.y)/radius;if(distance>=1)continue;const kernel=Math.pow(1-distance*distance,2),index=y*heat.width+x;
   weights.forEach((weight,g)=>{if(weight)fields[g][index]+=weight*kernel});
  }
 }
 const pixels=ctx.createImageData(heat.width,heat.height),colours=modes.map(g=>sensoryColours[g].slice(1).match(/../g).map(x=>Math.round(parseInt(x,16)*.65+255*.35)));
 for(let i=0;i<heat.width*heat.height;i++){let strongest=0,value=0;for(let g=0;g<modes.length;g++)if(fields[g][i]>value){strongest=g;value=fields[g][i]}if(value<.02)continue;const alpha=Math.min(dark?.85:.72,Math.log1p(value)/5*intensity);for(let c=0;c<3;c++)pixels.data[i*4+c]=colours[strongest][c];pixels.data[i*4+3]=Math.round(alpha*255)}
 ctx.putImageData(pixels,0,0);if(!map.getPane('heatPane')){const pane=map.createPane('heatPane');pane.style.zIndex='450';pane.style.pointerEvents='none'}L.imageOverlay(heat.toDataURL(),map.getBounds(),{interactive:false,pane:'heatPane',className:'concentration-heat'}).addTo(markers);
 // Each hit target stays on its actual supplied source coordinate.
 for(const cell of [...cells.values()].sort((a,b)=>b.entries.length-a.entries.length)){
  const n=cell.entries.length,places=[...new Map(cell.entries.map(x=>{const l=x.r.locations[0];return [l.lat+','+l.lon,l]})).values()],location=[places.reduce((sum,l)=>sum+l.lat,0)/places.length,places.reduce((sum,l)=>sum+l.lon,0)/places.length],diameter=20,hitSize=24;
  const select=()=>{mapScope=new Set(cell.entries.map(x=>x.r.key));update();showInspection('config')};
  const count=L.marker(location,{icon:L.divIcon({className:'concentration-marker heat-hit',html:`<span class="heat-source-centre" data-count="${n}"></span>`,iconSize:[hitSize,hitSize],iconAnchor:[hitSize/2,hitSize/2]}),keyboard:true}).addTo(markers);
  const narrativeCount=new Set(cell.entries.map(x=>x.r.key)).size,placeNames=[...new Set(places.map(l=>l.label))];
  const label=`${n} sensory events · ${narrativeCount} narratives · ${placeNames.join(', ')}. Select to explore.`;
  count.getElement().setAttribute('aria-label',label);count.getElement().setAttribute('role','button');
  count.getElement().addEventListener('keydown',ev=>{if(ev.key===' '){ev.preventDefault();select()}});
  const tip=el('div','concentration-tip');tip.append(el('strong','',`${n} sensory events`),el('div','',`${narrativeCount} narratives · ${placeNames.length} source places`),el('div','',placeNames.slice(0,3).join(' · ')+(placeNames.length>3?' …':'')),el('div','',places.some(l=>l.precision!=='source place')?'Approximate / regional source coordinate':'Supplied source-place coordinate'));for(const g of Object.keys(modeNames)){const n=cell.entries.filter(x=>x.e.groups.includes(g)).length;if(n)tip.append(el('div','',`${modeNames[g]}: ${n}`))}count.bindTooltip(tip,{direction:'top',className:'concentration-tooltip',offset:[0,-diameter/2]});count.on('click',select);
 }

}

function showInspection(view){
 $('#reader').hidden=false;
 if(view==='reader')return;
 $('#configuration').hidden=view!=='config';$('#metadata-panel').hidden=view!=='metadata';
 $('#show-config').setAttribute('aria-pressed',String(view==='config'));$('#show-metadata').setAttribute('aria-pressed',String(view==='metadata'));
}
function renderMetadata(){
 const panel=$('#metadata-panel');if(!panel)return;panel.replaceChildren();
 const r=DATA.find(x=>x.key===selected);if(!r){panel.append(el('p','empty','Choose a narrative to see its metadata.'));return}
 panel.append(el('p','eyebrow',`${collections[r.collection]} · ${r.id}`),el('h2','',r.title));
 const stats=el('div','metadata-stats');stats.append(el('span','',`${r.events.length} sensory events`),el('span','',r.translation?'English available':'Original only'));panel.append(stats);
 const chips=el('div','chips');r.groups.forEach(g=>chips.append(chip(modeNames[g],g)));panel.append(chips);contexts(r,panel);source(r,panel);
 panel.append(button('Go to narrative',()=>{$('#reader').scrollIntoView({behavior:'smooth',block:'start'});$('#reader').focus({preventScroll:true})}));
}

function initConfigurations(){
 $('#select-all-modes').onclick=()=>{configModes=new Set(Object.keys(modeNames));update()};$('#deselect-all-modes').onclick=()=>{configModes.clear();update()};$('#clear-all-filters').onclick=clearAllFilters;$('#clear-tools-filters').onclick=clearAllFilters;
 document.querySelectorAll('[data-research-view]').forEach(b=>b.onclick=()=>{researchView=b.dataset.researchView;renderConfigurations()});
 $('#show-config').onclick=()=>{showInspection('config');renderConfigurations()};$('#show-metadata').onclick=()=>{renderMetadata();showInspection('metadata')};
 for(const [g,name] of Object.entries(modeNames)){const b=button(name,()=>{configModes.has(g)?configModes.delete(g):configModes.add(g);update()});b.dataset.mode=g;b.setAttribute('aria-pressed','false');b.style.setProperty('--mode-colour',sensoryColours[g]);$('#config-modes').append(b)}
 document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{$('#config-group').value=b.dataset.group;renderConfigurations()});document.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{$('#config-match').value=b.dataset.match;update()});$('#clear-combination').onclick=()=>{resetSensorySelection();update()};
}
function svgElement(tag,attrs){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n}
function renderConfigurations(){
 if(!$('#config-canvas'))return;document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===$('#config-group').value)));document.querySelectorAll('[data-match]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.match===$('#config-match').value)));$('#match-help').textContent=!configModes.size?'No modes selected. Select a mode to show events.':{contains:'Includes every selected mode; other modes may also occur.',exact:'Only the selected modes, with no additional modes.',any:'Includes at least one selected mode; other modes may also occur.'}[$('#config-match').value];
 $('#sensory-filter-summary').textContent=`${configModes.size===7?'All 7':configModes.size} modes · ${{any:'At least one',contains:'Contains all',exact:'Exactly'}[$('#config-match').value]}`;
 const entries=eventEntries(filtered);if(selectedEvent&&!entries.some(x=>x.r.key===selectedEvent.r.key&&x.e.id===selectedEvent.e.id))selectedEvent=null;const groupBy=$('#config-group').value,groups=new Map();
 for(const x of entries){const key=groupBy==='collection'?collections[x.r.collection]:groupBy==='uncertainty'?({yes:'Uncertainty coded',no:'Not explicitly coded',unclear:'Coding unclear'}[x.e.uncertainty]||x.e.uncertainty):x.e.groups.map(g=>modeNames[g]).sort().join(' + ');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x)}
 $('#config-count').textContent=`${entries.length} events · ${new Set(entries.map(x=>x.r.key)).size} narratives · ${groups.size} groups`;
 $('#config-modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(configModes.has(b.dataset.mode))));
 const container=$('#config-canvas');container.replaceChildren();document.querySelectorAll('[data-research-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.researchView===researchView)));container.hidden=researchView!=='clusters';$('#research-view').hidden=researchView==='clusters';$('.config-controls').hidden=false;$('#config-modes').hidden=false;$('.config-caption').hidden=researchView!=='clusters';if(researchView!=='clusters'){$('#config-count').textContent=`${entries.length} events · ${new Set(entries.map(x=>x.r.key)).size} narratives`;renderResearchView(entries);return}
 if(!entries.length){$('#config-event').replaceChildren();container.append(el('p','empty','No events match this combination. Clear the combination or adjust the filters.'));return}
 const width=600,cols=2,cell=300,rows=Math.ceil(groups.size/cols),height=rows*280;const svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`${entries.length} events grouped by ${groupBy}`,class:'configuration-svg'});
 const defs=svgElement('defs',{});svg.append(defs);const fills=new Map();for(const {e} of entries){const key=[...e.groups].sort().join('-');if(fills.has(key))continue;if(e.groups.length<2){fills.set(key,eventColour(e));continue}const id='mode-gradient-'+key,gradient=svgElement('linearGradient',{id,x1:'0%',x2:'100%',y1:'0%',y2:'100%'});e.groups.forEach((g,i)=>{gradient.append(svgElement('stop',{offset:`${i*100/e.groups.length}%`,'stop-color':sensoryColours[g]}),svgElement('stop',{offset:`${(i+1)*100/e.groups.length}%`,'stop-color':sensoryColours[g]}))});defs.append(gradient);fills.set(key,`url(#${id})`)}
 let gi=0;for(const [key,items] of [...groups].sort((a,b)=>b[1].length-a[1].length)){const cx=150+(gi%cols)*cell,cy=125+Math.floor(gi/cols)*280;gi++;
  const heading=svgElement('text',{x:cx,y:cy+125,'text-anchor':'middle',class:'constellation-label'});const words=key.split(' + ');words.forEach((word,i)=>{const t=svgElement('tspan',{x:cx,dy:i?'14':'0'});t.textContent=word;heading.append(t)});svg.append(heading);
  const count=svgElement('text',{x:cx,y:cy+5,'text-anchor':'middle',class:'constellation-count'});count.textContent=items.length;
  const golden=Math.PI*(3-Math.sqrt(5));items.forEach(({r,e},i)=>{const radius=23+Math.sqrt((i+1)/items.length)*83,angle=i*golden,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius,colour=eventColour(e);
   svg.append(svgElement('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:colour,'stroke-width':.55,opacity:.25}));const dot=svgElement('circle',{cx:x,cy:y,r:items.length>300?2.5:3.6,fill:fills.get([...e.groups].sort().join('-')),stroke:selectedEvent?.e.id===e.id&&selectedEvent?.r.key===r.key?'#fff':'none','stroke-width':1.5,tabindex:'0',role:'button','aria-label':`${e.id}: ${e.modalities.join(', ')}`});
   const title=svgElement('title',{});title.textContent=`${collections[r.collection]} · ${e.id} · ${e.modalities.join(', ')}`;dot.append(title);dot.onclick=()=>chooseEvent(r,e);dot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();chooseEvent(r,e)}};svg.append(dot);
  });svg.append(svgElement('circle',{cx,cy,r:16,fill:'var(--constellation-centre)',stroke:'#7ca99f','stroke-width':1.2}),count);
 }
 container.append(svg);
 const detail=$('#config-event');detail.replaceChildren();if(selectedEvent){const {r,e}=selectedEvent;detail.append(el('p','eyebrow',`${collections[r.collection]} · ${e.id}`),el('p','',e.modalities.join(' + ')),el('blockquote','',e.span),el('p','hint',`Uncertainty: ${e.uncertainty} · ${e.kind}`),button('Read in narrative',()=>{selected=r.key;tab='original';renderReader();showInspection('reader');const info=$('#reader .annotation');if(info)eventInfo(info,[e])}));}else detail.append(el('p','hint','Choose an event on the map or in a constellation.'));
}

function clearAllFilters(){document.querySelectorAll('.filters input[type=checkbox]').forEach(x=>x.checked=false);$('#search').value='';$('#uncertainty').value='';resetSensorySelection();$('#config-group').value='modes';flowSelected=null;densitySelected=null;selectedEvent=null;mapScope=null;update()}
function renderActiveFilters(){
 const root=$('#active-filters');root.replaceChildren();let count=0;
 function add(label,remove){count++;const b=button(label+' ×',()=>{remove();update()});b.className='active-filter-chip';b.setAttribute('aria-label','Remove filter: '+label);root.append(b)}
 document.querySelectorAll('[name=collection]:checked').forEach(i=>add('Collection: '+collections[i.value],()=>{i.checked=false;mapScope=null}));
 document.querySelectorAll('[name=mode]:checked').forEach(i=>add('Mode: '+modeNames[i.value],()=>{i.checked=false;mapScope=null}));
 if($('#search').value.trim())add('Search: '+$('#search').value.trim(),()=>{$('#search').value='';mapScope=null});
 if($('#uncertainty').value)add('Uncertainty: '+$('#uncertainty').selectedOptions[0].text,()=>{$('#uncertainty').value='';mapScope=null});
 if($('#translated').checked)add('English available',()=>{$('#translated').checked=false;mapScope=null});
 if(!defaultSensorySelection())add(({exact:'Exactly: ',contains:'Contains all: ',any:'At least one: '}[$('#config-match').value])+(configModes.size?[...configModes].map(g=>modeNames[g]).join($('#config-match').value==='any'?' or ':' + '):'No modes selected'),resetSensorySelection);
 if(mapScope)add(mapScope==='unmapped'?'Without coordinates':'Selected map group',()=>{mapScope=null});
 if(flowSelected)add('Selected Flow strand',()=>{flowSelected=null;selectedEvent=null});
 if(!count)root.append(el('span','no-filters','All modes · At least one · All 600 narratives'));
 $('#active-filter-count').textContent=count;document.querySelectorAll('#clear-all-filters,#reset,#clear-tools-filters').forEach(b=>b.disabled=!count&&!selectedEvent);
}
function researchLegend(parent,extra=false){const legend=el('div','research-legend');for(const [g,name] of Object.entries(modeNames)){const x=el('span'),dot=el('i');dot.style.background=sensoryColours[g];x.append(dot,document.createTextNode(name));legend.append(x)}if(extra)legend.append(el('span','', '◉ Multiple modes'));parent.append(legend)}
function renderResearchView(entries){
 const root=$('#research-view');root.replaceChildren();$('#config-event').replaceChildren();
 if(!entries.length){root.append(el('p','empty','No events match this selection. Clear the combination or adjust the filters.'));return}
 if(researchView==='comparison'){renderSensoryComparison(root,entries);return}
 if(researchView==='text-density'){renderTextDensity(root,entries);return}
 renderEventFlow(root,entries);
}
function renderSensoryComparison(root,entries){
 root.append(el('h2','research-heading','Sensory composition'),el('p','research-note','Share of sensory-category links within each pilot collection. An event with two modes contributes one sensory-category link to each.'));
 researchLegend(root);
 const table=el('table','count-table'),thead=el('thead'),hr=el('tr');['Collection','Events',...Object.values(modeNames)].forEach(t=>hr.append(el('th','',t)));thead.append(hr);table.append(thead);const tbody=el('tbody');
 for(const [code,name] of Object.entries(collections)){const es=entries.filter(x=>x.r.collection===code),counts=Object.keys(modeNames).map(g=>[g,es.filter(x=>x.e.groups.includes(g)).length]),total=counts.reduce((n,x)=>n+x[1],0),row=el('div','composition-row'),header=el('div','composition-label');header.append(el('strong','',name),el('span','',`${es.length} events · ${total} sensory-category links`));row.append(header);const bar=el('div','composition-bar');bar.setAttribute('aria-label',name+' sensory composition');
  if(!total)bar.append(el('span','no-data','No matching events'));
  for(const [g,n] of counts){if(!n)continue;const percent=100*n/total,b=button('',()=>{document.querySelectorAll('[name=collection]').forEach(i=>i.checked=i.value===code);configModes=new Set([g]);$('#config-match').value='contains';mapScope=null;researchView='clusters';update()});b.style.width=percent+'%';b.style.backgroundColor=sensoryColours[g];b.style.color=$('#map-palette').value==='dark'?'#102233':'#ffffff';b.title=`${name} · ${modeNames[g]}: ${n} sensory-category links (${percent.toFixed(1)}%)`;b.setAttribute('aria-label',b.title+'. Explore these events');if(percent>=12)b.textContent=Math.round(percent)+'%';bar.append(b)}
  row.append(bar);root.append(row);const tr=el('tr');tr.append(el('th','',name),el('td','',es.length));counts.forEach(([,n])=>tr.append(el('td','',n)));tbody.append(tr);
 }
 table.append(tbody);const axis=el('div','composition-axis');['0%','25%','50%','75%','100%'].forEach(t=>axis.append(el('span','',t)));root.append(axis,el('p','research-note','Only sensory events are counted; unresolved candidates and responses are excluded. Counts describe this pilot selection, not prevalence in a country. Select a segment to inspect its events.'));
 const details=el('details','chart-data');details.append(el('summary','', 'View exact counts'));const wrap=el('div','table-scroll');wrap.append(table);details.append(wrap);root.append(details);
}
function renderEventFlow(root,entries){
 const byRecord=new Map();for(const x of entries){if(!byRecord.has(x.r.key))byRecord.set(x.r.key,[]);byRecord.get(x.r.key).push(x)}
 const records=[...byRecord.values()].sort((a,b)=>a[0].r.key.localeCompare(b[0].r.key));
 if(flowSelected&&!byRecord.has(flowSelected))flowSelected=null;
 root.append(el('h2','research-heading','Sensory progression'),el('p','research-note','One strand follows one narrative. Its colour changes between sensory modes. Hover over a point to preview its strand. Select it to keep the strand highlighted and open the passage below the map.'));
 const toolbar=el('div','flow-toolbar'),status=el('div','flow-selection-status'),clear=button('Clear strand selection',()=>{
  flowSelected=null;selectedEvent=null;hoveredKey=null;focus(null);
  renderReader();if(mapReady)renderMap(applyFilters());renderActiveFilters();
  detail.replaceChildren(el('p','research-note','Select a point on any sensory axis to highlight its strand and read the passage.'));
  status.focus({preventScroll:true});
 });status.tabIndex=-1;status.setAttribute('role','status');clear.setAttribute('aria-label','Clear strand selection and restore all matching strands. Keep current filters.');toolbar.append(el('span','',`${records.length} narratives · ${entries.length} events`),clear);root.append(toolbar,status);
 const chartWidth=Math.max(300,root.clientWidth);
 const lanes=[...Object.keys(modeNames),'multi'],svg=svgElement('svg',{viewBox:`0 0 ${chartWidth} 470`,class:'flow-svg flow-all',role:'group','aria-label':`${entries.length} sensory events across all ${records.length} matching narratives`}),defs=svgElement('defs',{}),x0=150,x1=chartWidth-15,y0=35,step=48;svg.append(defs);
 for(let i=0;i<lanes.length;i++){const y=y0+i*step,label=svgElement('text',{x:137,y:y+4,'text-anchor':'end',class:'flow-lane-label'});label.textContent=lanes[i]==='multi'?'Multiple modes':modeNames[lanes[i]];svg.append(svgElement('line',{x1:x0,x2:x1,y1:y,y2:y,stroke:'currentColor',opacity:.13,'pointer-events':'none'}),label)}
 const groups=[],hitTargets=[],detail=el('div','flow-detail');detail.setAttribute('aria-live','polite');
 function showDetail(r,e){detail.replaceChildren();detail.append(el('p','eyebrow',`${collections[r.collection]} · ${r.id}`),el('strong','',r.title),el('p','research-note',`${byRecord.get(r.key).length} matching events · selected: ${e.modalities.join(' + ')}`),el('blockquote','',e.span),button('Read highlighted passage',()=>chooseEvent(r,e)))}
 function focus(key){
  clear.hidden=!flowSelected;
  const current=byRecord.get(key)?.[0].r;
  status.textContent=current?`${key===flowSelected?'Selected':'Preview'}: ${collections[current.collection]} ${current.id}`:'All matching strands shown';
  for(const g of groups){const active=g.dataset.narrative===key;g.style.opacity=key?(active?'1':'.32'):'1';g.classList.toggle('flow-focused',active)}
 }
 let gi=0;for(const list of records){const r=list[0].r,es=[...list].sort((a,b)=>a.e.start-b.e.start||a.e.end-b.e.end),group=svgElement('g',{'data-narrative':r.key,class:'flow-strand'});groups.push(group);
  let hash=0;for(const c of r.key)hash=(hash*31+c.charCodeAt(0))>>>0;const jitter=(hash%1001)/1000*22-11;
  const len=Math.max(1,Array.from(r.text).length),points=es.map(({e})=>({e,x:x0+(x1-x0)*e.start/len,y:y0+step*lanes.indexOf(e.groups.length>1?'multi':e.groups[0])+jitter}));
  const id='strand-gradient-'+gi++,first=points[0],last=points[points.length-1],gradient=svgElement('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:first.x,y1:0,x2:last.x===first.x?first.x+1:last.x,y2:0});
  const stops=[];for(const point of points){const pos=(point.x-first.x)/Math.max(1,last.x-first.x);point.e.groups.forEach((g,i)=>stops.push({offset:Math.max(0,Math.min(1,pos+(i-(point.e.groups.length-1)/2)*.002)),colour:sensoryColours[g]}))}stops.sort((a,b)=>a.offset-b.offset).forEach(s=>gradient.append(svgElement('stop',{offset:s.offset,'stop-color':s.colour})));defs.append(gradient);
  if(points.length>1){let d=`M ${first.x} ${first.y}`;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid=(a.x+b.x)/2;d+=` C ${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`}group.append(svgElement('path',{d,fill:'none',stroke:`url(#${id})`,class:'flow-string','stroke-width':1.05,'pointer-events':'none'}))}
  for(const p of points){let fill=eventColour(p.e);if(p.e.groups.length>1){const dotId=`${id}-${p.e.id}`,dg=svgElement('linearGradient',{id:dotId,x1:0,y1:0,x2:1,y2:1});p.e.groups.forEach((g,i)=>{dg.append(svgElement('stop',{offset:i/p.e.groups.length,'stop-color':sensoryColours[g]}),svgElement('stop',{offset:(i+1)/p.e.groups.length,'stop-color':sensoryColours[g]}))});defs.append(dg);fill=`url(#${dotId})`}
   const dot=svgElement('circle',{cx:p.x,cy:p.y,r:2.8,fill,stroke:'transparent','stroke-width':4,tabindex:'0',role:'button','data-event':p.e.id,'aria-label':`${r.id} · ${p.e.id} · ${p.e.modalities.join(', ')}. Highlight this narrative`}),title=svgElement('title',{});title.textContent=`${r.id} · ${p.e.modalities.join(', ')} · ${Math.round((p.x-x0)/(x1-x0)*100)}% through text`;dot.append(title);
   const select=()=>{flowSelected=r.key;chooseEvent(r,p.e)};hitTargets.push({dot,r,e:p.e,x:p.x,y:p.y,select});dot.onclick=select;dot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select()}};group.append(dot);
  }svg.append(group);
 }
 for(const [x,t] of [[x0,'Beginning'],[(x0+x1)/2,'Position in original text'],[x1,'End']]){const label=svgElement('text',{x,y:t==='Position in original text'?456:426,'text-anchor':x===x0?'start':x===x1?'end':'middle',class:'flow-lane-label'});label.textContent=t;svg.append(label)}
 // Keep SVG nodes in place during hover so overlapping points remain clickable.
 let hoveredKey=null;
 function hitAt(ev){
  const direct=hitTargets.find(t=>t.dot===ev.target||t.dot.contains(ev.target));
  let hit=direct;if(!hit){const matrix=svg.getScreenCTM();if(!matrix)return;let distance=10;for(const t of hitTargets){const point=new DOMPoint(t.x,t.y).matrixTransform(matrix),d=Math.hypot(point.x-ev.clientX,point.y-ev.clientY);if(d<distance){distance=d;hit=t}}}
  return hit;
 }
 svg.addEventListener('pointermove',ev=>{
  if(ev.pointerType==='touch')return;
  const key=hitAt(ev)?.r.key||null;
  if(key!==hoveredKey){hoveredKey=key;focus(key||flowSelected)}
 });
 svg.addEventListener('pointerleave',()=>{hoveredKey=null;focus(flowSelected)});
 svg.addEventListener('focusin',ev=>{const hit=hitTargets.find(t=>t.dot===ev.target);if(hit)focus(hit.r.key)});
 svg.addEventListener('focusout',()=>focus(hoveredKey||flowSelected));
 svg.addEventListener('click',ev=>{
  const hit=hitAt(ev);
  if(hit){ev.preventDefault();ev.stopImmediatePropagation();hit.select()}
 },true);
 root.append(svg,el('p','research-note',`${filtered.length-records.length} narratives in the current selection have no matching sensory events. Single-event narratives appear as dots. Each event is positioned at the start of its first evidence passage, even when it has several passages. Position is not elapsed time or causation; small vertical offsets separate overlapping strands.`),detail);
 if(flowSelected){const list=byRecord.get(flowSelected);showDetail(list[0].r,list.find(x=>x.e.id===selectedEvent?.e.id)?.e||list[0].e)}else detail.append(el('p','research-note','Select a point on any sensory axis to highlight its strand and read the passage.'));focus(flowSelected);
}

function renderTextDensity(root,entries){
 const grouped=new Map();for(const {r,e} of entries){if(!grouped.has(r.key))grouped.set(r.key,{r,events:[]});grouped.get(r.key).events.push(e)}
 const rows=[...grouped.values()].map(x=>({...x,characters:Array.from(x.r.text).length})).filter(x=>x.characters>0);
 for(const x of rows)x.density=x.events.length*1000/x.characters;
 rows.sort((a,b)=>(densitySort==='density'?b.density-a.density:b.events.length-a.events.length)||b.events.length-a.events.length||a.r.key.localeCompare(b.r.key));
 root.append(el('h2','research-heading','Where the senses gather'),el('p','research-note','Rank narratives by annotation density or total sensory events. Select a bar to read its highlighted passages.'));
 const controls=el('div','density-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Rank narratives by');
 for(const [key,label] of [['density','Density'],['events','Event count']]){const b=button(label,()=>{densitySort=key;renderConfigurations()});b.setAttribute('aria-pressed',String(densitySort===key));controls.append(b)}root.append(controls);
 researchLegend(root);
 const top=rows[0],summary=el('div','density-summary');summary.append(el('strong','',top?(densitySort==='density'?top.density.toFixed(1):top.events.length):'0'),el('span','',densitySort==='density'?'Highest density · events / 1,000 characters':'Highest event count · one narrative'));root.append(summary);
 root.append(el('p','research-note',`${rows.length} narratives with matching events · ${densityShowAll?'all ranks':'top '+Math.min(20,rows.length)} shown`));
 const caption=el('div','density-caption');const captionTitle=el('strong','','Explore the weave'),captionMeta=el('span','','Hover or focus a strand to inspect a narrative · click to read');caption.append(captionTitle,captionMeta);root.append(caption);
 const list=el('div','density-list'),max=Math.max(1,...rows.map(x=>densitySort==='density'?x.density:x.events.length));
 rows.slice(0,densityShowAll?rows.length:20).forEach((x,i)=>{
  const value=densitySort==='density'?x.density:x.events.length,b=button('',()=>{densitySelected=x.r.key;chooseEvent(x.r,[...x.events].sort((a,b)=>a.start-b.start)[0])});b.className='density-row'+(densitySelected===x.r.key?' is-selected':'');b.setAttribute('aria-pressed',String(densitySelected===x.r.key));b.dataset.record=x.r.key;const describe=()=>{captionTitle.textContent=`${String(i+1).padStart(2,'0')} · ${x.r.title}`;captionMeta.textContent=`${collections[x.r.collection]} · ${x.r.id} · ${x.events.length} events · ${x.density.toFixed(1)} / 1,000 characters`};b.onpointerenter=describe;b.onfocus=describe;if(densitySelected===x.r.key)describe();
  b.setAttribute('aria-label',`${i+1}. ${x.r.title}. ${collections[x.r.collection]}, ${x.r.id}. ${x.density.toFixed(1)} events per 1,000 characters, ${x.events.length} events, ${x.characters} characters. Open text.`);
  const heading=el('div','density-heading');heading.append(el('span','density-rank',String(i+1).padStart(2,'0')),el('strong','',x.r.title),el('span','density-value',densitySort==='density'?value.toFixed(1):value));
  const meta=el('div','density-meta',`${collections[x.r.collection]} · ${x.r.id} · ${x.events.length} events / ${x.characters.toLocaleString('en')} characters`),track=el('div','density-track'),bar=el('div','density-bar');bar.style.width=(100*value/max)+'%';
  for(const g of Object.keys(modeNames)){const weight=x.events.reduce((n,e)=>n+(e.groups.includes(g)?1/e.groups.length:0),0);if(!weight)continue;const segment=el('span');segment.style.width=(100*weight/x.events.length)+'%';segment.style.background=sensoryColours[g];bar.append(segment)}
  track.append(bar);b.append(heading,meta,track);list.append(b);
 });list.classList.toggle('has-selection',rows.some(x=>x.r.key===densitySelected));root.append(list);
 if(rows.length>20){const more=button(densityShowAll?'Show top 20':`Show all ${rows.length} narratives`,()=>{densityShowAll=!densityShowAll;renderConfigurations()});more.className='density-more';root.append(more)}
 root.append(el('p','research-note density-method','Density = matching sensory events ÷ original-text characters × 1,000 (including spaces). Short texts can rank highly. Colours show the sensory mix; multimode events divide their colour shares equally and count once. This measures pilot annotation density, not sensory intensity; language, text length and coding differences affect comparisons.'));
}

document.querySelector('a.brand').onclick=ev=>{ev.preventDefault();clearAllFilters();document.querySelectorAll('select').forEach(s=>{for(const o of s.options)o.selected=o.defaultSelected});window.scrollTo(0,0);location.href=location.pathname};

let chartResizeTimer;window.addEventListener('resize',()=>{clearTimeout(chartResizeTimer);chartResizeTimer=setTimeout(()=>{if(researchView==='flow')renderConfigurations()},150)});
