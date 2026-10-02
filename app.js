'use strict';
const DATA=window.VERSE_DATA.records, $=s=>document.querySelector(s);
const evidenceById=new Map((window.VERSE_DATA.evidence||[]).map(e=>[e.evidence_id,e]));
const collections={LV:'Latvian',NO:'Norwegian',FI:'Finnish',SE:'Swedish'};
const modeNames={vision:'Vision',hearing:'Hearing',body:'Bodily experience',smell:'Smell',taste:'Taste',orientation:'Orientation / space',other:'Other perception'};
// Reading is limited to the revised examples; all records still support visualisations.
function narrativeLength(r){return r.textLength??Array.from(r.text||'').length}
function canReadRecord(r){return Boolean(r?.translation&&r?.reviewAnnotations)}
const translatedExamples=DATA.filter(canReadRecord);
const langs={LV:'lv',NO:'no',FI:'fi',SE:'sv'};
let map,mapReady=false,mapScope=null,markers,baseTiles,EventMapMarker;
const collectionColours={LV:'#b6a3cc',NO:'#97bcae',FI:'#d6b796',SE:'#9ebacf'};
// CSS tokens are the single colour source for HTML, SVG and canvas marks.
const sensoryTokens={vision:'vision',hearing:'hearing',body:'bodily',smell:'smell',taste:'taste',orientation:'space',other:'other'};
const sensoryColours={};
function themeToken(name){return getComputedStyle(document.documentElement).getPropertyValue('--'+name).trim()}
function readSensoryColours(){for(const [mode,token] of Object.entries(sensoryTokens))sensoryColours[mode]=themeToken('sens-'+token)}
readSensoryColours();
function relativeLuminance(hex){const channels=hex.replace('#','').match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*channels[0]+.7152*channels[1]+.0722*channels[2]}
function chartLabelColour(fill){
 const luminance=relativeLuminance(fill),dark=themeToken('chart-label-dark'),light=themeToken('chart-label-light');
 const contrast=c=>{const l=relativeLuminance(c);return (Math.max(l,luminance)+.05)/(Math.min(l,luminance)+.05)};
 const preferred=contrast(dark)>=contrast(light)?dark:light;
 // A few mid-luminance Light pigments need more contrast than either label token.
 return contrast(preferred)>=4.5?preferred:(contrast('#07111F')>=4.5?'#07111F':'#FFFFFF');
}
let mapView='density',countryLayer,selectedEvent=null;
let densitySort='density',densityShowAll=true,densitySelected=null;
document.addEventListener('click',ev=>{if(densitySelected&&!ev.target.closest('.density-list,[data-view-source]')){densitySelected=null;document.querySelector('#research-view [data-view-source]')?.remove();document.querySelector('.density-list')?.classList.remove('has-selection');document.querySelectorAll('.density-row.is-selected').forEach(row=>{row.classList.remove('is-selected');row.setAttribute('aria-pressed','false')});const caption=document.querySelector('.density-caption');if(caption){caption.querySelector('strong').textContent='Explore the weave';caption.querySelector('span').textContent='Hover or focus a strand to inspect a narrative · click to select'}}},true);
let configModes=new Set(Object.keys(modeNames)),eventMarks='events',researchView='comparison',flowSelected=null;
let selected=translatedExamples[0]?.key,tab='original',highlight=true,filtered=DATA;
let readingSelected=selected;
let showResponses=false,showCandidates=false,showObservations=false;
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function tone(node,g){node.dataset.mode=g;node.style.setProperty('--tone',`var(--${g})`);return node}
function chip(text,g){return tone(el('span','chip',text),g||'other')}
function button(text,action){const b=el('button','',text);b.type='button';b.onclick=action;return b}
function initExampleBrowser(){
 const select=$('#translated-example');
 for(const [key,name] of Object.entries(collections)){
  const group=el('optgroup');group.label=name;
  for(const r of translatedExamples.filter(r=>r.collection===key)){const option=el('option','',`${r.id} · ${r.title}`);option.value=r.key;group.append(option)}
  select.append(group);
 }
 function choose(key){
  if(!translatedExamples.some(r=>r.key===key))return;
  selected=key;selectedEvent=null;flowSelected=null;densitySelected=null;tab='original';highlight=true;
  renderReader();renderConfigurations();if(mapReady)renderMap(applyFilters());renderActiveFilters();
 }
 select.onchange=()=>choose(select.value);
 $('#example-previous').onclick=()=>choose(translatedExamples[translatedExamples.findIndex(r=>r.key===readingSelected)-1]?.key);
 $('#example-next').onclick=()=>choose(translatedExamples[translatedExamples.findIndex(r=>r.key===readingSelected)+1]?.key);
}
function renderExampleNavigation(record){
 const index=translatedExamples.findIndex(r=>r.key===record?.key);
 $('#translated-example').value=index>=0?record.key:'';
 $('#example-position').textContent=index>=0?`${index+1} / ${translatedExamples.length}`:`${translatedExamples.length} examples`;
 $('#example-previous').disabled=index<=0;
 $('#example-next').disabled=index<0||index===translatedExamples.length-1;
}
function check(container,value,label,count,group){const l=el('label','check'),i=el('input');i.type='checkbox';i.value=value;i.name=group;i.onchange=()=>{mapScope=null;update()};l.append(i);if(group==='mode')l.append(tone(el('span','dot'),value));l.append(document.createTextNode(label));if(count!==undefined)l.append(el('span','count',count));container.append(l)}
Object.entries(collections).forEach(([k,v])=>check($('#collections'),k,v,150,'collection'));
Object.entries(modeNames).forEach(([k,v])=>check($('#modes'),k,v,undefined,'mode'));
function legend(parent){const l=el('div','legend');Object.entries(modeNames).forEach(([g,name])=>{const s=el('span');s.append(tone(el('i','dot'),g),document.createTextNode(name));l.append(s)});parent.append(l)}
function defaultSensorySelection(){return $('#config-match').value==='any'&&configModes.size===Object.keys(modeNames).length}
function resetSensorySelection(){configModes=new Set(Object.keys(modeNames));$('#config-match').value='any'}
function applyFilters(ignoreCollection=false){const cs=[...document.querySelectorAll('[name=collection]:checked')].map(x=>x.value),ms=[...document.querySelectorAll('[name=mode]:checked')].map(x=>x.value),q=$('#search').value.toLocaleLowerCase().trim(),u=$('#uncertainty').value;return DATA.filter(r=>(ignoreCollection||!cs.length||cs.includes(r.collection))&&(!ms.length||r.groups.some(g=>ms.includes(g)))&&(!$('#translated').checked||canReadRecord(r))&&(!q||`${r.id} ${r.title} ${canReadRecord(r)?r.text+' '+r.translation:''}`.toLocaleLowerCase().includes(q))&&(!u||(u==='none'?!r.events.some(e=>['yes','unclear'].includes(e.uncertainty)):r.events.some(e=>e.uncertainty===u)))&&(defaultSensorySelection()||matchingEvents(r).length>0))}
function update(){const candidates=applyFilters();filtered=mapScope==='unmapped'?candidates.filter(r=>!r.locations.length):mapScope instanceof Set?candidates.filter(r=>mapScope.has(r.key)):candidates;if(!filtered.some(r=>r.key===selected))selected=filtered[0]?.key;renderReader();if(mapReady)renderMap(candidates);renderConfigurations();renderActiveFilters()}
function annotationSpans(e){return e.spans||[{start:e.start,end:e.end,span:e.span}]}
function allAnnotations(r){return [...r.events,...(r.candidates||[]),...(r.responses||[]),...(r.observations||[])]}
function visibleAnnotation(e){return e.type==='conservative'||e.type==='response'&&showResponses||e.type==='candidate'&&showCandidates||e.type==='observation'&&showObservations}
function eventInfo(parent,events){
 parent.replaceChildren();parent.hidden=false;
 for(const e of events){
  const item=el('div'),response=e.type==='response',candidate=e.type==='candidate',observation=e.type==='observation';
  item.append(el('p','eyebrow',`${response?'Response':candidate?'Unresolved candidate':observation?'Context / non-detection':'Sensory event'} · ${e.id}`));
  if(observation)item.append(el('strong','',e.label));
  if(response)item.append(el('strong','',e.label));
  for(const s of annotationSpans(e))item.append(el('blockquote','',s.span));
  if(response){
   item.append(el('p','',`Roles: ${e.roles.join(', ')}`),el('p','',e.event_ids.length?`Event link: ${e.link_status} · ${e.event_ids.join(', ')}`:'Not linked to a specific sensory event'),el('p','',e.explanation));
   if(e.context?.experiencer)item.append(el('p','',`Experiencer: ${e.context.experiencer}`));
   if(e.notes)item.append(el('p','',e.notes));
  }else{
   const chips=el('div','chips');e.modalities.forEach((m,i)=>chips.append(chip(m,e.groups[i]||e.groups[0])));item.append(chips);
   item.append(el('p','',`Perceptual status: ${e.polarity}`),el('p','',`Narrated uncertainty: ${e.uncertainty==='no'?'not stated':e.uncertaintyType}`));
   if(candidate||observation)item.append(el('p','hint','Excluded from map points, graphs and sensory-event counts.'));
   if(e.evidence)item.append(el('p','',`Uncertainty evidence: ${e.evidence}`));
   if(e.note)item.append(el('p','',e.note));
   if(Object.keys(e.context||{}).length){const dl=el('dl');for(const [k,v] of Object.entries(e.context))dl.append(el('dt','',k.replaceAll('_',' ')),el('dd','',v));item.append(dl)}
  }
  if(e.relatedEventIds?.length&&!response)item.append(el('p','hint',`Related event: ${e.relatedEventIds.join(', ')}`));
  if(e.gloss)item.append(el('p','hint',`Working gloss: ${e.gloss}`));
  const ids=e.evidenceIds||[...(e.evidence_ids||[]),...(e.link_evidence_ids||[])],proofs=ids.map(id=>evidenceById.get(id)).filter(Boolean);
  if(proofs.length){const d=el('details');d.append(el('summary','', 'Supporting evidence'));for(const proof of proofs)d.append(el('p','hint',`${proof.field.replaceAll('_',' ')} · ${proof.start_codepoint}–${proof.end_codepoint_exclusive}`),el('blockquote','',proof.quote));item.append(d)}
  parent.append(item);
 }
}
function annotationLayers(r,parent){
 const nr=(r.responses||[]).length,nc=(r.candidates||[]).length,no=(r.observations||[]).length;if(!nr&&!nc&&!no)return;
 const d=el('details','annotation-layers');d.open=showResponses||showCandidates||showObservations;
 d.append(el('summary','',`Additional annotations · ${nr+nc+no}`),el('p','hint',`Optional layers${r.reviewAnnotations?' in both languages':''}, excluded from sensory-event counts. Dashed underlines mark candidates, solid underlines responses, and dotted underlines context or non-detection.`));
 for(const [id,label,count,checked,set] of [['show-responses','Responses',nr,showResponses,v=>showResponses=v],['show-candidates','Possible sensory experiences',nc,showCandidates,v=>showCandidates=v],['show-observations','Context and non-detection',no,showObservations,v=>showObservations=v]]){
  const l=el('label','check'),input=el('input');input.type='checkbox';input.id=id;input.checked=checked;input.disabled=!count&&!checked;input.onchange=()=>{set(input.checked);renderReader()};l.append(input,document.createTextNode(`${label} (${count})`));d.append(l);
 }parent.append(d);
}
function original(r,parent,isTranslation=false){
 if(!canReadRecord(r))return;
 const text=el('div','narrative');text.lang=isTranslation?'en':langs[r.collection];
 const content=isTranslation?r.translation:r.text,eventList=(isTranslation?(r.translationEvents||[]):allAnnotations(r)).filter(visibleAnnotation);
 const info=el('div','annotation');info.hidden=true;const points=Array.from(content);
 const ranges=eventList.flatMap(e=>annotationSpans(e).map(s=>({...s,event:e})));
 const boundaries=[...new Set([0,points.length,...ranges.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 for(let i=0;i<boundaries.length-1;i++){
  const a=boundaries[i],b=boundaries[i+1],segment=points.slice(a,b).join('');
  const covering=ranges.filter(s=>s.start<=a&&s.end>=b),events=[...new Map(covering.map(s=>[s.event.id,s.event])).values()];
  if(!events.length||!highlight){text.append(document.createTextNode(segment));continue}
  const sensory=covering.filter(s=>s.event.type==='conservative'),modes=[...new Set(sensory.flatMap(s=>s.groups||s.event.groups))],mark=el('mark',modes.length>1?'multi':'',segment);
  if(modes.length){mark.dataset.modes=modes.join(' ');tone(mark,modes[0]);if(modes[1])mark.style.setProperty('--tone2',`var(--${modes[1]})`)}else mark.classList.add('auxiliary-mark');
  if(events.some(e=>e.type==='candidate'))mark.classList.add('candidate-mark');
  if(events.some(e=>e.type==='response'))mark.classList.add('response-mark');
  if(events.some(e=>e.type==='observation'))mark.classList.add('observation-mark');
  if(selectedEvent?.r.key===r.key&&events.some(e=>e.id===selectedEvent.e.id))mark.classList.add('chosen');
  mark.dataset.record=r.key;mark.dataset.eventIds=events.map(e=>e.id).join(' ');mark.tabIndex=0;mark.setAttribute('role','button');
  const labels=[...modes.map(g=>modeNames[g]),...(events.some(e=>e.type==='response')?['Response']:[]),...(events.some(e=>e.type==='candidate')?['Candidate']:[]),...(events.some(e=>e.type==='observation')?['Context / non-detection']:[])];
  mark.setAttribute('aria-label',`${labels.join(', ')}: ${segment}. Inspect annotation`);
  function select(){
   const ids=events.map(e=>e.id),main=r.events.find(e=>ids.includes(e.id));selectedEvent=main?{r,e:main}:null;
   document.querySelectorAll('mark[data-event-ids]').forEach(m=>{if(m.dataset.record===r.key)m.classList.toggle('chosen',m.dataset.eventIds.split(' ').some(id=>ids.includes(id)))});
   eventInfo(info,events.map(e=>isTranslation?allAnnotations(r).find(source=>source.id===e.id):e).filter(Boolean));info.scrollIntoView({behavior:'smooth',block:'nearest'});
  }mark.onclick=select;mark.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}};text.append(mark);
 }parent.append(text,info);
}
function translation(r,parent){
 if(!r.translation)return;
 const status=r.reviewAnnotations?`Working translation · ${r.reviewAnnotations.basis==='data.docx'?'Coding revised from the supplied review.':'Coding revised from the earlier discussion; this example was absent from the review document.'} Original-language alignment remains provisional.`:`Working translation · Not reviewed by a human. ${r.translationAlignedEvents===r.events.length?'Sensory highlights are provisionally aligned with the original annotations.':'Some sensory highlights are not yet aligned with the original annotations.'}`;
 const section=el('section','translation-block');section.setAttribute('aria-label','English translation');section.append(el('h3','language-heading','English translation'),el('p','hint translation-status',status));
 original(r,section,true);
 if(r.translationNotes.length){const d=el('details');d.append(el('summary','', 'Translator notes'));r.translationNotes.forEach(n=>d.append(el('p','',n)));section.append(d)}parent.append(section);
}

function contexts(r,parent){const section=el('div','context');section.append(el('h3','', 'Narrative context'));const dl=el('dl');for(const [k,label] of [['place','Place'],['time','Time'],['movement','Movement']]){dl.append(el('dt','',label),el('dd','',r.context[k]||'Not coded'))}section.append(dl,el('p','hint','Contexts recorded for sensory events. Event details show their supporting evidence.'));parent.append(section)}
function reviewDecisions(r,parent){
 if(!r.reviewAnnotations)return;
 const review=r.reviewAnnotations,d=el('details','annotation-review');d.append(el('summary','','Annotation review'),el('p','hint',`Basis: ${review.basis}. ${review.original_alignment}.`));
 if(review.notes)d.append(el('p','',review.notes));
 if(review.decisions.length){const table=el('table'),head=el('thead'),tr=el('tr');tr.append(el('th','','Review fragment'),el('th','','Classification and reasoning'));head.append(tr);table.append(head);const body=el('tbody');for(const row of review.decisions){if(row[0].trim()==='Fragment')continue;const line=el('tr');line.append(el('td','',row[0]),el('td','',row[1]||'No additional classification supplied.'));body.append(line)}table.append(body);d.append(table)}parent.append(d);
}
function source(r,parent){parent.append(el('h3','', 'Source reference'),el('p','',r.source||'No source reference supplied for this record.'),el('p','',`Record: ${r.id} · ${collections[r.collection]}`),el('p','',`Source category: ${r.category||'Not supplied'}`));for(const loc of r.locations||[])parent.append(el('p','',`Map: ${loc.label} · ${loc.precision}. ${loc.provenance}`));if(r.place)parent.append(el('p','',`Collection place: ${r.place}`));if(canReadRecord(r)&&r.annotationNote)parent.append(el('p','',`Annotation note: ${r.annotationNote}`));parent.append(el('p','hint','Source categories and collection places are metadata, not inferred narrative identities or event locations.'))}
function renderReader(){renderMetadata();const parent=$('#reader');parent.replaceChildren();const selectedRecord=DATA.find(x=>x.key===selected);if(canReadRecord(selectedRecord))readingSelected=selected;const r=translatedExamples.find(x=>x.key===readingSelected);renderExampleNavigation(r);$('#source-text-selection').textContent=canReadRecord(r)?`${collections[r.collection]} · ${r.id}`:'Choose one of the 24 examples';if(!canReadRecord(r)){parent.append(el('p','empty','Reading is limited to the 24 selected examples. Choose an example above; other narratives contribute to the maps and graphs only.'));return}const top=el('div','reader-top');top.append(el('p','eyebrow',`${collections[r.collection].toUpperCase()} COLLECTION · ${r.id}`));parent.append(top,el('h1','',r.title),el('div','reader-meta',`${r.events.length} sensory event${r.events.length===1?'':'s'} · ${r.translation?'English translation available':'Original language'}`));const chips=el('div','chips');r.groups.forEach(g=>chips.append(chip(modeNames[g],g)));parent.append(chips);if(!r.events.length&&r.observations?.length)parent.append(el('p','hint','This example records spatial experience and context. Open Additional annotations to inspect these passages.'));const tabs=el('div','tabs');for(const [id,label] of [['original','Text'],['source','Source information']]){const b=button(label,()=>{tab=id;renderReader()});b.className=tab===id?'active':'';b.setAttribute('aria-pressed',String(tab===id));tabs.append(b)}parent.append(tabs);if(tab==='original'){const row=el('div','toggle-row');row.append(el('span','hint','Select a highlighted passage to inspect its annotation.'));const label=el('label'),input=el('input');input.type='checkbox';input.checked=highlight;input.onchange=()=>{highlight=input.checked;renderReader()};label.append(input,document.createTextNode('Highlight'));row.append(label);parent.append(row);annotationLayers(r,parent);legend(parent);parent.append(el('h3','language-heading','Original'));original(r,parent);translation(r,parent);contexts(r,parent)}else if(tab==='english')translation(r,parent);else{source(r,parent);reviewDecisions(r,parent)}}
$('#search').oninput=()=>{mapScope=null;update()};$('#uncertainty').onchange=$('#translated').onchange=()=>{mapScope=null;update()};$('#reset').onclick=clearAllFilters;$('#browse').onclick=()=>{$('#corpus-map').scrollIntoView({behavior:'smooth',block:'center'});if(mapReady)map.invalidateSize()};$('#read-examples').onclick=()=>{const target=$('#translated-example');target.focus({preventScroll:true});$('#source-text').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})};$('#about').onclick=()=>$('#about-dialog').showModal();$('#close-about').onclick=()=>$('#about-dialog').close();initExampleBrowser();initConfigurations();initMap();update();

$("#corpus-summary").textContent = `${DATA.length} narratives · ${new Set(DATA.map(r=>r.collection)).size} collections · ${translatedExamples.length} reading examples`;
function initMap(){
 if(!window.L){$('#map-status').textContent='Map library unavailable. The 24 reading examples remain available below.';return}
 // Animate each dot to its bounded spread at the destination zoom, rather than
 // enlarging its geographic offset and snapping it back when zooming finishes.
 EventMapMarker=L.Marker.extend({
  _animateZoom(ev){
   const {loc,radius,angle}=this.options.eventLayout;
   const position=eventMapPosition(loc,radius,angle,ev.zoom);
   this._setPos(this._map._latLngToNewLayerPoint(position,ev.zoom,ev.center).round());
  }
 });
 map=L.map('corpus-map',{scrollWheelZoom:true,minZoom:3,maxZoom:14,zoomSnap:.25,zoomControl:true}).setView([62,19],innerWidth>1150?4.25:3.5);
 countryLayer=L.geoJSON(window.VERSE_COUNTRIES,{style:{color:'#263343',weight:.65,fillColor:'#142030',fillOpacity:1},interactive:false,smoothFactor:.5}).addTo(map);
 map.attributionControl.addAttribution('Overview: <a href="https://www.naturalearthdata.com/">Natural Earth</a>');
 for(const [name,lat,lon] of [['NORWAY',65,10],['SWEDEN',63,16],['FINLAND',65,26],['LATVIA',56.6,24.8],['ESTONIA',59,25],['BALTIC SEA',57.7,19]])L.marker([lat,lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'country-label',html:name,iconSize:[90,20]})}).addTo(map);
 markers=L.layerGroup().addTo(map);mapReady=true;
 document.querySelectorAll('[data-map-view]').forEach(b=>b.onclick=()=>{mapView=b.dataset.mapView;renderMap(applyFilters())});
 $('#map-palette').value=document.documentElement.dataset.theme;
 $('#map-palette').onchange=ev=>{
  const palette=$('#map-palette').value;
  document.documentElement.dataset.theme=palette;readSensoryColours();
  if(ev){try{localStorage.setItem('verse-theme',palette)}catch{ /* Theme switching also works when browser storage is blocked. */ }}
  document.querySelectorAll('#config-modes button').forEach(b=>b.style.setProperty('--mode-colour',sensoryColours[b.dataset.mode]));
  $('#corpus-map').classList.toggle('night',palette==='dark');$('#configuration').classList.toggle('night',palette==='dark');
  countryLayer.setStyle({fillColor:themeToken('map-land'),color:themeToken('map-border'),weight:.75});
  if(mapReady){renderMap(applyFilters());renderConfigurations()}
 };
 $('#map-palette').onchange();
 $('#event-marks').onchange=()=>{eventMarks=$('#event-marks').value;renderMap(applyFilters())};
 $('#heat-intensity').oninput=()=>{$('#heat-intensity-value').textContent=$('#heat-intensity').value+'%';renderMap(applyFilters())};
 $('#heat-radius').oninput=()=>{const value=$('#heat-radius').value;$('#heat-radius-value').textContent=value+' px';$('#heat-radius').setAttribute('aria-valuetext',value+' pixels');renderMap(applyFilters())};
 $('#heat-contours').onchange=()=>renderMap(applyFilters());
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
function eventMarkerSymbol(e,size){
 const centre=size/2+3,radius=size/2-.7,side=size+6,groups=e.groups.length?e.groups:['other'];
 const shapes=groups.length===1?`<circle class="event-fill" cx="${centre}" cy="${centre}" r="${radius}" fill="${sensoryColours[groups[0]]}"/><circle class="event-edge" cx="${centre}" cy="${centre}" r="${radius}" stroke="${sensoryColours[groups[0]]}"/>`:groups.map((g,i)=>{
  const a=i*2*Math.PI/groups.length-Math.PI/2,b=(i+1)*2*Math.PI/groups.length-Math.PI/2;
  const x1=centre+Math.cos(a)*radius,y1=centre+Math.sin(a)*radius,x2=centre+Math.cos(b)*radius,y2=centre+Math.sin(b)*radius;
  return `<path class="event-fill" d="M${centre} ${centre}L${x1} ${y1}A${radius} ${radius} 0 0 1 ${x2} ${y2}Z" fill="${sensoryColours[g]}"/><path class="event-edge" d="M${x1} ${y1}A${radius} ${radius} 0 0 1 ${x2} ${y2}" stroke="${sensoryColours[g]}"/>`;
 }).join('');
 return `<svg class="event-glyph" aria-hidden="true" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" style="--event-colour:${eventColour(e)}">${shapes}<circle class="selection-ring" cx="${centre}" cy="${centre}" r="${radius+3}"/></svg>`;
}
function chooseEvent(r,e,openText=false){
 selected=r.key;selectedEvent={r,e};tab='original';highlight=true;
 if(!filtered.some(x=>x.key===r.key)){mapScope=null;update()}
 renderConfigurations();renderReader();if(mapReady)renderMap(applyFilters());renderActiveFilters();
 const info=$('#reader .annotation');if(canReadRecord(r)&&info)eventInfo(info,[e]);
 if(openText&&canReadRecord(r))showInspection('reader');
}

function eventMapGroups(records){const groups=new Map();for(const entry of eventEntries(records)){const loc=entry.r.locations[0];if(!loc)continue;const key=`${loc.lat},${loc.lon}`;if(!groups.has(key))groups.set(key,{loc,entries:[]});groups.get(key).entries.push(entry)}return [...groups.values()]}
// Keep the overview spacing, then add a little room as users zoom in. The
// screen radius grows smoothly towards 145%, instead of doubling at every zoom.
function eventSpreadScale(zoom){
 const steps=zoom-4.25;
 return steps<=0?2**steps:1+.45*(1-Math.exp(-steps/2));
}
function eventMapPosition(loc,radius,angle,zoom){
 const origin=map.project([loc.lat,loc.lon],zoom),offset=radius*eventSpreadScale(zoom);
 return map.unproject(L.point(origin.x+Math.cos(angle)*offset,origin.y+Math.sin(angle)*offset),zoom);
}
function eventMapLayout(records){
 const zoom=map.getZoom(),spread=Number($('#event-spread').value),golden=Math.PI*(3-Math.sqrt(5));
 return eventMapGroups(records).map(({loc,entries})=>{
  entries.sort((a,b)=>(a.r.key+a.e.id).localeCompare(b.r.key+b.e.id));
  return {loc,entries:entries.map((entry,i)=>{
   const radius=entries.length===1?12:12+spread*2.8*Math.sqrt(i+1),angle=i*golden;
   return {...entry,eventLayout:{loc,radius,angle},position:eventMapPosition(loc,radius,angle,zoom)};
  })};
 });
}
function renderEventMap(records,background=false){
 const all=eventEntries(records),groups=eventMapLayout(records),mappedCount=groups.reduce((n,g)=>n+g.entries.length,0);
 if(!background)$('#map-count').textContent=`${mappedCount} mapped events · ${all.length-mappedCount} without coordinates`;
 if(!background)$('#map-explanation').textContent='One dot = one sensory event. Fine spokes lead to its source-place anchor; spread is visual, not geographic. Multicoloured dots have multiple modes. Select a dot to highlight an event; select a place ring to explore its events. Source texts can be opened separately below. Click an empty area of the map to clear the selection.';
 const dotSize=Math.min(15,8+Math.max(0,map.getZoom()-4.25)*1.2),hitSize=Math.max(20,dotSize+10);
 for(const {loc,entries} of groups){
  entries.forEach(({r,e,position,eventLayout})=>{const colour=eventColour(e);
   L.polyline([[loc.lat,loc.lon],position],{className:'event-spoke',color:colour,weight:.65,opacity:background?.04:.2,interactive:false}).addTo(markers);
   const dot=new EventMapMarker(position,{eventLayout,icon:L.divIcon({className:'event-map-dot'+(background?' map-context-dot':''),html:eventMarkerSymbol(e,dotSize),iconSize:[hitSize,hitSize],iconAnchor:[hitSize/2,hitSize/2]}),keyboard:!background,interactive:!background,opacity:background?.24:1,title:`${e.id} · ${e.modalities.join(', ')}`}).addTo(markers);
   if(background){dot.getElement().removeAttribute('title');dot.getElement().setAttribute('aria-hidden','true');return}
   const isSelected=selectedEvent?.r.key===r.key&&selectedEvent?.e.id===e.id;
   dot.getElement().classList.toggle('is-selected',isSelected);dot.getElement().setAttribute('aria-pressed',String(isSelected));
   dot.getElement().removeAttribute('title');dot.getElement().setAttribute('aria-label',`${e.id} · ${e.modalities.join(', ')} · ${loc.label}. Select event`);
   const eventTip=el('div','map-event-tip');eventTip.append(el('strong','',e.modalities.join(' · ')),el('span','map-tip-place',loc.label),el('span','map-tip-id',e.id));dot.bindTooltip(eventTip,{direction:'top',offset:[0,-8],className:'event-tooltip'});dot.on('click',()=>chooseEvent(r,e));dot.getElement().addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();chooseEvent(r,e)}});
  });
  if(background)continue;
  const anchor=L.circleMarker([loc.lat,loc.lon],{radius:5,color:themeToken('map-label'),weight:1.2,fillColor:themeToken('map-water'),fillOpacity:.85,dashArray:loc.precision==='source place'?null:'2 2'}).addTo(markers);
  anchor.bindTooltip(el('span','',`${loc.label} · ${entries.length} events${loc.precision==='source place'?'':' · approximate / regional'}`));anchor.on('click',()=>{mapScope=new Set(entries.map(x=>x.r.key));update();showInspection('config')});
 }
}
function concentrationIntensity(percent){
 // Displayed 100% now matches the former 60% appearance. Keep both endpoints
 // and a responsive slider throughout the Soft–Bright range.
 const calibrated=percent<=100?40+(percent-40)/3:60+(percent-100)*1.5;
 return calibrated/100;
}
function renderEventConcentration(records){
 const all=eventEntries(records),mapped=all.filter(x=>x.r.locations.length),sourceGroups=eventMapGroups(records);
 const cells=new Map(sourceGroups.map((group,i)=>[i,group]));
 const dark=$('#map-palette').value==='dark',radius=Number($('#heat-radius').value),contours=$('#heat-contours').checked;
 const legend=$('#map-legend');legend.replaceChildren(el('strong','','Sensory layers'));for(const [g,name] of Object.entries(modeNames)){const item=button(name,()=>{configModes=new Set([g]);$('#config-match').value='any';update()});const swatch=el('b');swatch.style.background=sensoryColours[g];item.prepend(swatch);item.className='heat-category';item.style.setProperty('--mode-colour',sensoryColours[g]);item.setAttribute('aria-pressed',String(configModes.size===1&&configModes.has(g)));legend.append(item)}legend.append(button('All modes',()=>{resetSensorySelection();update()}));
 $('#map-count').textContent=`${mapped.length} mapped events · ${all.length-mapped.length} without coordinates`;
 $('#map-explanation').textContent=`Colour fields follow supplied source coordinates. Mixed colours show overlapping sensory layers; select a category to see its own colour. Brightness shows local concentration. Nearby locations blend within a ${radius}-pixel smoothing radius. ${contours?'Coloured contours trace each sensory layer, not distance rings. ':''}Radius adjusts visual blending, not geographic distance or coordinate accuracy. Approximate source places remain approximate.`;
 const dimensions=map.getSize(),heat=document.createElement('canvas');heat.width=dimensions.x;heat.height=dimensions.y;
 const ctx=heat.getContext('2d'),modes=Object.keys(modeNames),fields=modes.map(()=>new Float32Array(heat.width*heat.height)),eventField=new Float32Array(heat.width*heat.height),intensity=concentrationIntensity(Number($('#heat-intensity').value));
 const sidebarModes=[...document.querySelectorAll('[name=mode]:checked')].map(input=>input.value);
 const visibleModes=configModes.size<modes.length?configModes:new Set(sidebarModes.length?sidebarModes:modes);
 for(const {loc,entries} of sourceGroups){
  const point=map.latLngToContainerPoint([loc.lat,loc.lon]),weights=modes.map(g=>visibleModes.has(g)?entries.filter(x=>x.e.groups.includes(g)).length:0);
  for(let y=Math.max(0,Math.floor(point.y-radius));y<Math.min(heat.height,point.y+radius);y++)for(let x=Math.max(0,Math.floor(point.x-radius));x<Math.min(heat.width,point.x+radius);x++){
   const distance=Math.hypot(x-point.x,y-point.y)/radius;if(distance>=1)continue;const kernel=Math.pow(1-distance*distance,2),index=y*heat.width+x;
   eventField[index]+=entries.length*kernel;
   weights.forEach((weight,g)=>{if(weight)fields[g][index]+=weight*kernel});
  }
 }
 const pixels=ctx.createImageData(heat.width,heat.height),colours=modes.map(g=>sensoryColours[g].slice(1).match(/../g).map(x=>parseInt(x,16)));
 // Every local category contributes. Log weighting keeps minority layers visible;
 // a bounded chroma lift avoids grey/brown mixtures of complementary pigments.
 // Intensity changes opacity only, never the counted events or smoothing radius.
 const gain=Math.sqrt(Math.max(0,Math.min(1,(intensity-.4)/1.4))),opacity=dark?.35+.63*gain:.3+.6*gain;
 for(let i=0;i<heat.width*heat.height;i++){
  const value=eventField[i];if(value<=.1)continue;
  let weight=0,peak=0,chromaSum=0;const rgb=[0,0,0];
  for(let g=0;g<modes.length;g++){
   const v=fields[g][i];if(!v)continue;
   const w=Math.log1p(v),high=Math.max(...colours[g]),low=Math.min(...colours[g]);weight+=w;peak+=high*w;chromaSum+=(high-low)*w;
   for(let c=0;c<3;c++)rgb[c]+=colours[g][c]*w;
  }
  if(!weight)continue;
  for(let c=0;c<3;c++)rgb[c]/=weight;
  const hi=Math.max(...rgb),lo=Math.min(...rgb),range=Math.max(1,hi-lo);
  const chroma=Math.min(range*5,Math.max(range,.85*chromaSum/weight)),ceiling=peak/weight;
  const density=Math.min(1,Math.log1p(value)/Math.log(17)),edge=Math.min(1,(value-.1)/.22),fade=edge*edge*(3-2*edge);
  const alpha=opacity*fade*(.52+.48*density),lighten=dark?.06*density:0;
  for(let c=0;c<3;c++)pixels.data[i*4+c]=Math.round(Math.max(0,Math.min(255,ceiling-(hi-rgb[c])*chroma/range))*(1-lighten)+255*lighten);
  pixels.data[i*4+3]=Math.round(alpha*255);
 }
 ctx.putImageData(pixels,0,0);
 if(contours)for(let g=0;g<modes.length;g++)drawHeatContours(ctx,fields[g],heat.width,heat.height,dark,intensity,sensoryColours[modes[g]]);
 if(!map.getPane('heatPane')){const pane=map.createPane('heatPane');pane.style.zIndex='450';pane.style.pointerEvents='none'}L.imageOverlay(heat.toDataURL(),map.getBounds(),{interactive:false,pane:'heatPane',className:'concentration-heat'}).addTo(markers);
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

// Marching squares on the same concentration field: nearby peaks form shared
// contours. Fixed levels keep the overlay comparable when filters change.
function drawHeatContours(ctx,field,width,height,dark,intensity,colour){
 const step=3,levels=[.5,2,8,32,64];
 ctx.save();ctx.strokeStyle=colour;ctx.globalAlpha=dark?.42+.2*intensity/1.8:.56;ctx.lineWidth=.8;ctx.lineCap='round';ctx.lineJoin='round';
 for(const level of levels){
  ctx.beginPath();
  for(let y=0;y<height-step;y+=step)for(let x=0;x<width-step;x+=step){
   const a=field[y*width+x],b=field[y*width+x+step],c=field[(y+step)*width+x+step],d=field[(y+step)*width+x];
   if(Math.max(a,b,c,d)<level||Math.min(a,b,c,d)>=level)continue;
   const crosses=[];
   if((a>=level)!==(b>=level))crosses.push([x+step*(level-a)/(b-a),y]);
   if((b>=level)!==(c>=level))crosses.push([x+step,y+step*(level-b)/(c-b)]);
   if((c>=level)!==(d>=level))crosses.push([x+step-step*(level-c)/(d-c),y+step]);
   if((d>=level)!==(a>=level))crosses.push([x,y+step-step*(level-d)/(a-d)]);
   const connect=(i,j)=>{ctx.moveTo(...crosses[i]);ctx.lineTo(...crosses[j])};
   if(crosses.length===2)connect(0,1);
   else if(crosses.length===4){if((a>=level)===((a+b+c+d)/4>=level)){connect(0,1);connect(2,3)}else{connect(0,3);connect(1,2)}}
  }
  ctx.stroke();
 }
 ctx.restore();
}

function showInspection(view){
 if(view==='reader'){
  if(!canReadRecord(DATA.find(r=>r.key===selected)))return;
  // The examples are always visible below the map.
  requestAnimationFrame(()=>{const target=$('#reader mark.chosen')||$('#reader');target.focus({preventScroll:true});target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:target.matches('mark')?'center':'start'})});
  return;
 }
 $('#configuration').hidden=view!=='config';$('#metadata-panel').hidden=view!=='metadata';
 $('#show-config').setAttribute('aria-pressed',String(view==='config'));$('#show-metadata').setAttribute('aria-pressed',String(view==='metadata'));
}
function renderMetadata(){
 const panel=$('#metadata-panel');if(!panel)return;panel.replaceChildren();
 const r=DATA.find(x=>x.key===selected);if(!r){panel.append(el('p','empty','Choose a narrative to see its metadata.'));return}
 panel.append(el('p','eyebrow',`${collections[r.collection]} · ${r.id}`),el('h2','',r.title));
 const stats=el('div','metadata-stats');stats.append(el('span','',`${r.events.length} sensory events`),el('span','',canReadRecord(r)?'Reading example · original + English':'Patterns only · text not displayed'));panel.append(stats);
 const chips=el('div','chips');r.groups.forEach(g=>chips.append(chip(modeNames[g],g)));panel.append(chips);if(canReadRecord(r))contexts(r,panel);source(r,panel);
 if(canReadRecord(r))panel.append(button('View source text',()=>showInspection('reader')));
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
 $('#config-count').textContent=`${entries.length} events · ${new Set(entries.map(x=>x.r.key)).size} of ${filtered.length} narratives · ${groups.size} groups`;
 $('#config-modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(configModes.has(b.dataset.mode))));
 const container=$('#config-canvas');container.replaceChildren();document.querySelectorAll('[data-research-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.researchView===researchView)));container.hidden=researchView!=='clusters';$('#research-view').hidden=researchView==='clusters';$('.config-controls').hidden=false;$('#config-modes').hidden=false;$('.config-caption').hidden=researchView!=='clusters';if(researchView!=='clusters'){$('#config-count').textContent=`${entries.length} events · ${new Set(entries.map(x=>x.r.key)).size} of ${filtered.length} narratives`;renderResearchView(entries);return}
 if(!entries.length){$('#config-event').replaceChildren();container.append(el('p','empty','No events match this combination. Clear the combination or adjust the filters.'));return}
 const width=600,cols=2,cell=300,rows=Math.ceil(groups.size/cols),height=rows*280;const svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`${entries.length} events grouped by ${groupBy}`,class:'configuration-svg'});
 const defs=svgElement('defs',{});svg.append(defs);const fills=new Map();for(const {e} of entries){const key=[...e.groups].sort().join('-');if(fills.has(key))continue;if(e.groups.length<2){fills.set(key,eventColour(e));continue}const id='mode-gradient-'+key,gradient=svgElement('linearGradient',{id,x1:'0%',x2:'100%',y1:'0%',y2:'100%'});e.groups.forEach((g,i)=>{gradient.append(svgElement('stop',{offset:`${i*100/e.groups.length}%`,'stop-color':sensoryColours[g]}),svgElement('stop',{offset:`${(i+1)*100/e.groups.length}%`,'stop-color':sensoryColours[g]}))});defs.append(gradient);fills.set(key,`url(#${id})`)}
 let gi=0;for(const [key,items] of [...groups].sort((a,b)=>b[1].length-a[1].length)){const cx=150+(gi%cols)*cell,cy=125+Math.floor(gi/cols)*280;gi++;
  const heading=svgElement('text',{x:cx,y:cy+125,'text-anchor':'middle',class:'constellation-label'});const words=key.split(' + ');words.forEach((word,i)=>{const t=svgElement('tspan',{x:cx,dy:i?'14':'0'});t.textContent=word;heading.append(t)});svg.append(heading);
  const count=svgElement('text',{x:cx,y:cy+5,'text-anchor':'middle',class:'constellation-count'});count.textContent=items.length;
  const golden=Math.PI*(3-Math.sqrt(5));items.forEach(({r,e},i)=>{const radius=23+Math.sqrt((i+1)/items.length)*83,angle=i*golden,x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius,colour=eventColour(e);
   svg.append(svgElement('line',{x1:cx,y1:cy,x2:x,y2:y,stroke:colour,'stroke-width':.55,opacity:.25}));const dot=svgElement('circle',{cx:x,cy:y,r:items.length>300?2.5:3.6,fill:fills.get([...e.groups].sort().join('-')),stroke:selectedEvent?.e.id===e.id&&selectedEvent?.r.key===r.key?themeToken('text-primary'):'none','stroke-width':1.5,tabindex:'0',role:'button','aria-label':`${e.id}: ${e.modalities.join(', ')}`});
   const title=svgElement('title',{});title.textContent=`${collections[r.collection]} · ${e.id} · ${e.modalities.join(', ')}`;dot.append(title);dot.onclick=()=>chooseEvent(r,e);dot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();chooseEvent(r,e)}};svg.append(dot);
  });svg.append(svgElement('circle',{cx,cy,r:16,fill:'var(--constellation-centre)',stroke:themeToken('ui-border'),'stroke-width':1.2}),count);
 }
 container.append(svg);
 const detail=$('#config-event');detail.replaceChildren();if(selectedEvent){const {r,e}=selectedEvent;detail.append(el('p','eyebrow',`${collections[r.collection]} · ${e.id}`),el('p','',e.modalities.join(' + ')),el('p','hint',`Uncertainty: ${e.uncertainty} · ${e.kind}`));if(canReadRecord(r))detail.append(button('View source text',()=>chooseEvent(r,e,true)));}else detail.append(el('p','hint','Choose an event on the map or in a constellation.'));
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
  for(const [g,n] of counts){if(!n)continue;const percent=100*n/total,b=button('',()=>{document.querySelectorAll('[name=collection]').forEach(i=>i.checked=i.value===code);configModes=new Set([g]);$('#config-match').value='contains';mapScope=null;researchView='clusters';update()});b.style.width=percent+'%';b.style.backgroundColor=sensoryColours[g];b.style.setProperty('--segment-label',chartLabelColour(sensoryColours[g]));b.dataset.mode=g;b.title=`${name} · ${modeNames[g]}: ${n} sensory-category links (${percent.toFixed(1)}%)`;b.setAttribute('aria-label',b.title+'. Explore these events');if(percent>=12)b.textContent=Math.round(percent)+'%';bar.append(b)}
  row.append(bar);root.append(row);const tr=el('tr');tr.append(el('th','',name),el('td','',es.length));counts.forEach(([,n])=>tr.append(el('td','',n)));tbody.append(tr);
 }
 table.append(tbody);const axis=el('div','composition-axis');['0%','25%','50%','75%','100%'].forEach(t=>axis.append(el('span','',t)));root.append(axis,el('p','research-note','Only sensory events are counted; candidates, responses and contextual annotations are excluded. Counts describe this pilot selection, not prevalence in a country. Select a segment to inspect its events.'));
 const details=el('details','chart-data');details.append(el('summary','', 'View exact counts'));const wrap=el('div','table-scroll');wrap.append(table);details.append(wrap);root.append(details);
}
function renderEventFlow(root,entries){
 const byRecord=new Map();for(const x of entries){if(!byRecord.has(x.r.key))byRecord.set(x.r.key,[]);byRecord.get(x.r.key).push(x)}
 const records=[...byRecord.values()].sort((a,b)=>a[0].r.key.localeCompare(b[0].r.key));
 if(flowSelected&&!byRecord.has(flowSelected))flowSelected=null;
 root.append(el('h2','research-heading','Sensory progression'),el('p','research-note','One strand follows one narrative. Its colour changes between sensory modes. Hover over a point to preview its strand. Select it to keep the strand highlighted. Reading is available for the 24 selected examples.'));
 const toolbar=el('div','flow-toolbar'),status=el('div','flow-selection-status'),clear=button('Clear strand selection',()=>{
  flowSelected=null;selectedEvent=null;hoveredKey=null;focus(null);
  renderReader();if(mapReady)renderMap(applyFilters());renderActiveFilters();
  detail.replaceChildren(el('p','research-note','Select a point on any sensory axis to highlight its strand.'));
  status.focus({preventScroll:true});
 });status.tabIndex=-1;status.setAttribute('role','status');clear.setAttribute('aria-label','Clear strand selection and restore all matching strands. Keep current filters.');toolbar.append(el('span','',`${records.length} narratives · ${entries.length} events`),clear);root.append(toolbar,status);
 const chartWidth=Math.max(300,root.clientWidth);
 const lanes=[...Object.keys(modeNames),'multi'],svg=svgElement('svg',{viewBox:`0 0 ${chartWidth} 470`,class:'flow-svg flow-all',role:'group','aria-label':`${entries.length} sensory events across all ${records.length} matching narratives`}),defs=svgElement('defs',{}),x0=150,x1=chartWidth-15,y0=35,step=48;svg.append(defs);
 for(let i=0;i<lanes.length;i++){const y=y0+i*step,label=svgElement('text',{x:137,y:y+4,'text-anchor':'end',class:'flow-lane-label'});label.textContent=lanes[i]==='multi'?'Multiple modes':modeNames[lanes[i]];svg.append(svgElement('line',{x1:x0,x2:x1,y1:y,y2:y,stroke:'currentColor',opacity:.13,'pointer-events':'none'}),label)}
 const groups=[],hitTargets=[],detail=el('div','flow-detail');detail.setAttribute('aria-live','polite');
 function showDetail(r,e){detail.replaceChildren();detail.append(el('p','eyebrow',`${collections[r.collection]} · ${r.id}`),el('strong','',r.title),el('p','research-note',`${byRecord.get(r.key).length} matching events · selected: ${e.modalities.join(' + ')}`));if(canReadRecord(r))detail.append(button('View source text',()=>chooseEvent(r,e,true)))}
 function focus(key){
  clear.hidden=!flowSelected;
  const current=byRecord.get(key)?.[0].r;
  status.textContent=current?`${key===flowSelected?'Selected':'Preview'}: ${collections[current.collection]} ${current.id}`:'All matching strands shown';
  for(const g of groups){const active=g.dataset.narrative===key;g.style.opacity=key?(active?'1':'.32'):'1';g.classList.toggle('flow-focused',active)}
 }
 let gi=0;for(const list of records){const r=list[0].r,es=[...list].sort((a,b)=>a.e.start-b.e.start||a.e.end-b.e.end),group=svgElement('g',{'data-narrative':r.key,class:'flow-strand'});groups.push(group);
  let hash=0;for(const c of r.key)hash=(hash*31+c.charCodeAt(0))>>>0;const jitter=(hash%1001)/1000*22-11;
  const len=Math.max(1,narrativeLength(r)),points=es.map(({e})=>({e,x:x0+(x1-x0)*e.start/len,y:y0+step*lanes.indexOf(e.groups.length>1?'multi':e.groups[0])+jitter}));
  const id='strand-gradient-'+gi++,first=points[0],last=points[points.length-1],gradient=svgElement('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:first.x,y1:0,x2:last.x===first.x?first.x+1:last.x,y2:0});
  const stops=[];for(const point of points){const pos=(point.x-first.x)/Math.max(1,last.x-first.x);point.e.groups.forEach((g,i)=>stops.push({offset:Math.max(0,Math.min(1,pos+(i-(point.e.groups.length-1)/2)*.002)),colour:sensoryColours[g]}))}stops.sort((a,b)=>a.offset-b.offset).forEach(s=>gradient.append(svgElement('stop',{offset:s.offset,'stop-color':s.colour})));defs.append(gradient);
  if(points.length>1){let d=`M ${first.x} ${first.y}`;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid=(a.x+b.x)/2;d+=` C ${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`}group.append(svgElement('path',{d,fill:'none',stroke:`url(#${id})`,class:'flow-string','stroke-width':1.05,'pointer-events':'none'}))}
  for(const p of points){let fill=eventColour(p.e);if(p.e.groups.length>1){const dotId=`${id}-${p.e.id}`,dg=svgElement('linearGradient',{id:dotId,x1:0,y1:0,x2:1,y2:1});p.e.groups.forEach((g,i)=>{dg.append(svgElement('stop',{offset:i/p.e.groups.length,'stop-color':sensoryColours[g]}),svgElement('stop',{offset:(i+1)/p.e.groups.length,'stop-color':sensoryColours[g]}))});defs.append(dg);fill=`url(#${dotId})`}
   const dot=svgElement('circle',{cx:p.x,cy:p.y,r:2.8,fill,stroke:'transparent','stroke-width':4,tabindex:'0',role:'button','data-event':p.e.id,'aria-label':`${r.id} · ${p.e.id} · ${p.e.modalities.join(', ')}. Highlight this narrative`});
   const select=()=>{flowSelected=r.key;chooseEvent(r,p.e)};hitTargets.push({dot,r,e:p.e,x:p.x,y:p.y,select});dot.onclick=select;dot.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();select()}};group.append(dot);
  }svg.append(group);
 }
 for(const [x,t] of [[x0,'Beginning'],[(x0+x1)/2,'Position in original text'],[x1,'End']]){const label=svgElement('text',{x,y:t==='Position in original text'?456:426,'text-anchor':x===x0?'start':x===x1?'end':'middle',class:'flow-lane-label'});label.textContent=t;svg.append(label)}
 // An HTML tooltip replaces native SVG titles; it never intercepts point clicks.
 const chart=el('div','flow-chart'),tooltip=el('div','flow-tooltip'),tipHeading=el('div','flow-tip-heading'),tipSwatch=el('i','flow-tip-swatch'),tipModes=el('strong'),tipRecord=el('div','flow-tip-record'),tipPosition=el('div','flow-tip-position');
 tooltip.id='flow-event-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
 tipHeading.append(tipSwatch,tipModes);tooltip.append(tipHeading,tipRecord,tipPosition);chart.append(svg,tooltip);
 let tooltipHit=null,dismissedHit=null;
 function hideTooltip(){tooltipHit?.dot.removeAttribute('aria-describedby');tooltipHit=null;tooltip.hidden=true}
 function showTooltip(hit){
  if(!hit||hit===dismissedHit){hideTooltip();return}
  if(hit!==tooltipHit){
   hideTooltip();tooltipHit=hit;hit.dot.setAttribute('aria-describedby',tooltip.id);
   tipSwatch.style.background=eventGradient(hit.e);tipModes.textContent=hit.e.groups.map(g=>modeNames[g]).join(' · ');
   tipRecord.textContent=`${collections[hit.r.collection]} · ${hit.r.id}`;
   tipPosition.textContent=`${Math.round((hit.x-x0)/(x1-x0)*100)}% through text`;
  }
  tooltip.hidden=false;
  const frame=chart.getBoundingClientRect(),point=hit.dot.getBoundingClientRect(),width=tooltip.offsetWidth,height=tooltip.offsetHeight;
  const left=Math.max(8,Math.min(frame.width-width-8,point.left+point.width/2-frame.left-width/2));
  let top=point.bottom-frame.top+12;
  if(top+height>Math.min(frame.height,window.innerHeight-frame.top)-8)top=point.top-frame.top-height-12;
  tooltip.style.left=left+'px';tooltip.style.top=Math.max(8,top)+'px';
 }
 // Keep SVG nodes in place during hover so overlapping points remain clickable.
 let hoveredKey=null;
 function hitAt(ev){
  const direct=hitTargets.find(t=>t.dot===ev.target||t.dot.contains(ev.target));
  let hit=direct;if(!hit){const matrix=svg.getScreenCTM();if(!matrix)return;let distance=10;for(const t of hitTargets){const point=new DOMPoint(t.x,t.y).matrixTransform(matrix),d=Math.hypot(point.x-ev.clientX,point.y-ev.clientY);if(d<distance){distance=d;hit=t}}}
  return hit;
 }
 svg.addEventListener('pointermove',ev=>{
  if(ev.pointerType==='touch')return;
  const hit=hitAt(ev),key=hit?.r.key||null;
  if(hit!==dismissedHit)dismissedHit=null;
  if(key!==hoveredKey){hoveredKey=key;focus(key||flowSelected)}
  showTooltip(hit);
 });
 svg.addEventListener('pointerleave',()=>{hoveredKey=null;dismissedHit=null;hideTooltip();focus(flowSelected)});
 svg.addEventListener('focusin',ev=>{const hit=hitTargets.find(t=>t.dot===ev.target);if(hit){dismissedHit=null;focus(hit.r.key);showTooltip(hit)}});
 svg.addEventListener('focusout',()=>{hideTooltip();focus(hoveredKey||flowSelected)});
 svg.addEventListener('keydown',ev=>{if(ev.key==='Escape'){dismissedHit=tooltipHit;hideTooltip()}});
 svg.addEventListener('click',ev=>{
  const hit=hitAt(ev);
  if(hit){ev.preventDefault();ev.stopImmediatePropagation();hit.select()}
 },true);
 root.append(chart,el('p','research-note',`${filtered.length-records.length} narratives in the current selection have no matching sensory events. Single-event narratives appear as dots. Each event is positioned at the start of its first evidence passage, even when it has several passages. Position is not elapsed time or causation; small vertical offsets separate overlapping strands.`),detail);
 if(flowSelected){const list=byRecord.get(flowSelected);showDetail(list[0].r,list.find(x=>x.e.id===selectedEvent?.e.id)?.e||list[0].e)}else detail.append(el('p','research-note','Select a point on any sensory axis to highlight its strand.'));focus(flowSelected);
}

function renderTextDensity(root,entries){
 const grouped=new Map();for(const {r,e} of entries){if(!grouped.has(r.key))grouped.set(r.key,{r,events:[]});grouped.get(r.key).events.push(e)}
 const rows=[...grouped.values()].map(x=>({...x,characters:narrativeLength(x.r)})).filter(x=>x.characters>0);
 for(const x of rows)x.density=x.events.length*1000/x.characters;
 rows.sort((a,b)=>(densitySort==='density'?b.density-a.density:b.events.length-a.events.length)||b.events.length-a.events.length||a.r.key.localeCompare(b.r.key));
 root.append(el('h2','research-heading','Where the senses gather'),el('p','research-note','Rank narratives by annotation density or total sensory events. Select a bar to highlight a narrative. Reading is available for the 24 selected examples.'));
 const controls=el('div','density-controls');controls.setAttribute('role','group');controls.setAttribute('aria-label','Rank narratives by');
 for(const [key,label] of [['density','Density'],['events','Event count']]){const b=button(label,()=>{densitySort=key;renderConfigurations()});b.setAttribute('aria-pressed',String(densitySort===key));controls.append(b)}root.append(controls);
 researchLegend(root);
 const top=rows[0],summary=el('div','density-summary');summary.append(el('strong','',top?(densitySort==='density'?top.density.toFixed(1):top.events.length):'0'),el('span','',densitySort==='density'?'Highest density · events / 1,000 characters':'Highest event count · one narrative'));root.append(summary);
 root.append(el('p','research-note',`${rows.length} narratives with matching events · ${densityShowAll?'all ranks':'top '+Math.min(20,rows.length)} shown`));
 const caption=el('div','density-caption');const captionTitle=el('strong','','Explore the weave'),captionMeta=el('span','','Hover or focus a strand to inspect a narrative · click to select');caption.append(captionTitle,captionMeta);root.append(caption);
 const selectedRow=rows.find(x=>x.r.key===densitySelected);if(selectedRow&&canReadRecord(selectedRow.r)){const read=button('View source text',()=>chooseEvent(selectedRow.r,selectedRow.events[0],true));read.dataset.viewSource='';root.append(read)}
 const list=el('div','density-list'),max=Math.max(1,...rows.map(x=>densitySort==='density'?x.density:x.events.length));
 rows.slice(0,densityShowAll?rows.length:20).forEach((x,i)=>{
  const value=densitySort==='density'?x.density:x.events.length,b=button('',()=>{densitySelected=x.r.key;chooseEvent(x.r,[...x.events].sort((a,b)=>a.start-b.start)[0])});b.className='density-row'+(densitySelected===x.r.key?' is-selected':'');b.setAttribute('aria-pressed',String(densitySelected===x.r.key));b.dataset.record=x.r.key;const describe=()=>{captionTitle.textContent=`${String(i+1).padStart(2,'0')} · ${x.r.title}`;captionMeta.textContent=`${collections[x.r.collection]} · ${x.r.id} · ${x.events.length} events · ${x.density.toFixed(1)} / 1,000 characters`};b.onpointerenter=describe;b.onfocus=describe;if(densitySelected===x.r.key)describe();
  b.setAttribute('aria-label',`${i+1}. ${x.r.title}. ${collections[x.r.collection]}, ${x.r.id}. ${x.density.toFixed(1)} events per 1,000 characters, ${x.events.length} events, ${x.characters} characters. Select narrative.`);
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

// Dataset-derived documentation stays in sync with the reviewed annotations.
const annotationCounts=window.VERSE_DATA.counts;
$('#annotation-count-summary').textContent=`The underlying pilot coding includes ${annotationCounts.events} sensory events, ${annotationCounts.candidates} unresolved candidates and ${annotationCounts.responses.toLocaleString()} response annotations. Only sensory events contribute to maps and graphs. Additional layers are optional. An event with several evidence passages still counts once.`;
