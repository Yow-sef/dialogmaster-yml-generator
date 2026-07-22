/* ============================================================
   MiniMessage-lite parser
   DialogMaster yml uses MiniMessage strings, not vanilla JSON
   text components, so we can't reuse misode's TextComponent.tsx
   directly (it expects {text,color,bold,...} objects). This parses
   a useful subset of MiniMessage into the same shape TextComponent
   works with, then renders it with the exact same CSS classes /
   shadow-color logic misode uses, so it looks identical in the
   preview.
============================================================ */
const NAMED_COLORS = {
  black: ['#000','#000'], dark_blue:['#00A','#00002A'], dark_green:['#0A0','#002A00'],
  dark_aqua:['#0AA','#002A2A'], dark_red:['#A00','#2A0000'], dark_purple:['#A0A','#2A002A'],
  gold:['#FA0','#2A2A00'], gray:['#AAA','#2A2A2A'], grey:['#AAA','#2A2A2A'], dark_gray:['#555','#151515'], dark_grey:['#555','#151515'],
  blue:['#55F','#15153F'], green:['#5F5','#153F15'], aqua:['#5FF','#153F3F'], red:['#F55','#3F1515'],
  light_purple:['#F5F','#3F153F'], yellow:['#FF5','#3F3F15'], white:['#FFF','#3F3F3F'],
};
function shadowFor(hex){
  // approximate vanilla's ~25% brightness drop shadow color for arbitrary hex
  const c = hex.replace('#','');
  const full = c.length===3 ? c.split('').map(x=>x+x).join('') : c.padEnd(6,'0');
  const r=parseInt(full.slice(0,2),16), g=parseInt(full.slice(2,4),16), b=parseInt(full.slice(4,6),16);
  const d = v => Math.round(v*0.25).toString(16).padStart(2,'0');
  return `#${d(r)}${d(g)}${d(b)}`;
}
function resolveColor(name){
  if(!name) return null;
  name = name.toLowerCase().replace(/-/g,'_');
  if(NAMED_COLORS[name]) return NAMED_COLORS[name];
  if(/^#?[0-9a-f]{6}$/i.test(name) || /^#?[0-9a-f]{3}$/i.test(name)){
    const hex = name.startsWith('#') ? name : '#'+name;
    return [hex, shadowFor(hex)];
  }
  return null;
}
function lerpColor(a,b,t){
  const pa=parseInt(a.replace('#',''),16), pb=parseInt(b.replace('#',''),16);
  const ar=(pa>>16)&255, ag=(pa>>8)&255, ab=pa&255;
  const br=(pb>>16)&255, bg=(pb>>8)&255, bb=pb&255;
  const r=Math.round(ar+(br-ar)*t), g=Math.round(ag+(bg-ag)*t), b2=Math.round(ab+(bb-ab)*t);
  return '#'+[r,g,b2].map(v=>v.toString(16).padStart(2,'0')).join('');
}

// returns array of {text, color, bold, italic, underlined, strikethrough}
function parseMiniMessage(input){
  input = String(input ?? '');
  const segments = [];
  let style = {color:null, bold:false, italic:false, underlined:false, strikethrough:false};
  const stack = [];
  let i = 0;
  const tagRe = /<(\/?)([a-zA-Z0-9_:#-]+)(?::([^>]*))?>/g;
  let last = 0, m;
  function pushText(txt){ if(txt) segments.push({text:txt, ...style}); }
  while((m = tagRe.exec(input))){
    pushText(input.slice(last, m.index));
    last = tagRe.lastIndex;
    const closing = m[1]==='/';
    const name = m[2].toLowerCase();
    const arg = m[3];
    if(closing){
      if(stack.length){ style = stack.pop(); }
      continue;
    }
    stack.push({...style});
    if(name==='b'||name==='bold') style.bold = true;
    else if(name==='i'||name==='italic'||name==='em') style.italic = true;
    else if(name==='u'||name==='underlined') style.underlined = true;
    else if(name==='st'||name==='strikethrough') style.strikethrough = true;
    else if(name==='reset') style = {color:null,bold:false,italic:false,underlined:false,strikethrough:false};
    else if(name==='color'||name==='colour'){
      const col = resolveColor(arg);
      if(col) style.color = col;
    } else if(name==='gradient'){
      // handled specially below via a marker; simple approach: split gradient span at closing tag
      // find matching close tag position for naive gradient support
      const closeIdx = input.indexOf('</gradient>', last);
      const inner = closeIdx>=0 ? input.slice(last, closeIdx) : '';
      const stops = (arg||'white:white').split(':').map(s=>resolveColor(s)?.[0] || '#FFFFFF');
      const chars = inner.replace(/<[^>]+>/g,'').split('');
      const n = Math.max(chars.length-1,1);
      chars.forEach((ch,idx)=>{
        const t = idx/n;
        const segCount = stops.length-1;
        const scaled = t*segCount;
        const seg = Math.min(Math.floor(scaled), segCount-1);
        const localT = scaled-seg;
        const col = segCount>0 ? lerpColor(stops[seg], stops[seg+1], localT) : stops[0];
        segments.push({text:ch, ...style, color:[col, shadowFor(col)]});
      });
      if(closeIdx>=0){ tagRe.lastIndex = closeIdx + '</gradient>'.length; last = tagRe.lastIndex; }
      continue;
    } else if(name.startsWith('#')){
      const col = resolveColor(name);
      if(col) style.color = col;
    } else {
      const col = resolveColor(name);
      if(col) style.color = col;
      // unknown/unsupported tags (item:, key:, click:, hover:, lang: etc) are silently ignored
    }
  }
  pushText(input.slice(last));
  return segments;
}

function renderTextComponent(mmString, {oneline=false}={}){
  const wrap = document.createElement('div');
  wrap.className = 'text-component';
  const segs = parseMiniMessage(mmString);
  if(!segs.length){ return wrap; }
  segs.forEach(s=>{
    const span = document.createElement('span');
    let text = s.text;
    if(oneline) text = text.replace(/\n/g, '\u240a');
    span.textContent = text;
    const styleParts = [];
    if(s.color){ styleParts.push(`color:${s.color[0]}`); styleParts.push(`--shadow-color:${s.color[1]}`); }
    else { styleParts.push('color:#FFF'); styleParts.push('--shadow-color:#3F3F3F'); }
    if(s.bold) styleParts.push('font-weight:bold');
    if(s.italic) styleParts.push('font-style:italic');
    if(s.underlined && s.strikethrough) styleParts.push('text-decoration:underline line-through');
    else if(s.underlined) styleParts.push('text-decoration:underline');
    else if(s.strikethrough) styleParts.push('text-decoration:line-through');
    span.setAttribute('style', styleParts.join(';'));
    wrap.appendChild(span);
  });
  return wrap;
}
function stripTags(s){ return String(s||'').replace(/<[^>]+>/g,''); }

/* ============================================================
   State
============================================================ */
let state = { body:[], inputs:[], buttons:[], footerButtons:[], confirmButton:null, denyButton:null, okButton:null };
function uid(){ return Math.random().toString(36).slice(2,9); }
function esc(v){ return String(v ?? '').replace(/\\/g,'\\\\').replace(/"/g,'\\"'); }
function q(v){ return `"${esc(v)}"`; }
function escAttr(s){ return String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ============================================================
   BODY editor
============================================================ */
function addBody(){
  state.body.push({id:uid(), type:'plain-message', content:'<gray>Some text', material:'DIAMOND_SWORD', name:'<aqua>Item Name', lore:['<gray>Lore line'], showDecorations:true, showTooltip:true, width:250, height:64});
  renderBodyList(); render();
}
function removeBody(id){ state.body = state.body.filter(b=>b.id!==id); renderBodyList(); render(); }
function updateBody(id,key,val){ const b=state.body.find(x=>x.id===id); b[key]=val; if(key==='type') renderBodyList(); render(); }
function renderBodyList(){
  const el = document.getElementById('bodyList');
  el.innerHTML='';
  if(!state.body.length) el.innerHTML = '<small class="hint">No body content yet.</small>';
  state.body.forEach(b=>{
    const card = document.createElement('div'); card.className='item-card';
    card.innerHTML = `
      <button class="del" onclick="removeBody('${b.id}')">✕</button>
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select onchange="updateBody('${b.id}','type',this.value)">
            <option value="plain-message" ${b.type==='plain-message'?'selected':''}>plain-message</option>
            <option value="item" ${b.type==='item'?'selected':''}>item (real ItemStack render)</option>
          </select>
        </div>
      </div>
      ${b.type==='plain-message' ? `
      <div class="field-row"><div class="field"><label>Content (MiniMessage)</label><input type="text" value="${escAttr(b.content)}" oninput="updateBody('${b.id}','content',this.value)"></div></div>
      ` : `
      <div class="field-row">
        <div class="field"><label>Material</label><input type="text" value="${escAttr(b.material)}" oninput="updateBody('${b.id}','material',this.value)"></div>
        <div class="field"><label>Name</label><input type="text" value="${escAttr(b.name)}" oninput="updateBody('${b.id}','name',this.value)"></div>
      </div>
      <div class="field-row"><div class="field"><label>Lore (separate lines with |)</label><input type="text" value="${escAttr((b.lore||[]).join(' | '))}" oninput="updateBody('${b.id}','lore',this.value.split('|').map(s=>s.trim()))"></div></div>
      <div class="field-row">
        <div class="field"><label>Width</label><input type="number" value="${b.width}" oninput="updateBody('${b.id}','width',+this.value)"></div>
        <div class="field"><label>Height</label><input type="number" value="${b.height}" oninput="updateBody('${b.id}','height',+this.value)"></div>
        <div class="field chk"><input type="checkbox" ${b.showDecorations?'checked':''} onchange="updateBody('${b.id}','showDecorations',this.checked)"><label>Decorations</label></div>
        <div class="field chk"><input type="checkbox" ${b.showTooltip?'checked':''} onchange="updateBody('${b.id}','showTooltip',this.checked)"><label>Tooltip</label></div>
      </div>
      `}
    `;
    el.appendChild(card);
  });
  const add = document.createElement('button'); add.className='add-btn'; add.textContent='+ Add body item'; add.onclick=()=>addBody(); el.appendChild(add);
}

/* ============================================================
   INPUTS editor
============================================================ */
function addInput(){
  state.inputs.push({id:uid(), type:'text', key:'my_input', label:'<white>Label', width:150, maxLength:16, initial:'', multiline:false, min:0,max:100,step:1, options:['option_one','option_two']});
  renderInputList(); render();
}
function removeInput(id){ state.inputs = state.inputs.filter(b=>b.id!==id); renderInputList(); render(); }
function updateInput(id,key,val){ const i=state.inputs.find(x=>x.id===id); i[key]=val; if(key==='type') renderInputList(); render(); }
function renderInputList(){
  const el = document.getElementById('inputList');
  el.innerHTML='';
  if(!state.inputs.length) el.innerHTML = '<small class="hint">No inputs yet.</small>';
  state.inputs.forEach(i=>{
    const card = document.createElement('div'); card.className='item-card';
    card.innerHTML = `
      <button class="del" onclick="removeInput('${i.id}')">✕</button>
      <div class="field-row">
        <div class="field"><label>Type</label>
          <select onchange="updateInput('${i.id}','type',this.value)">
            <option value="text" ${i.type==='text'?'selected':''}>text</option>
            <option value="boolean" ${i.type==='boolean'?'selected':''}>boolean</option>
            <option value="number" ${i.type==='number'?'selected':''}>number range</option>
            <option value="option" ${i.type==='option'?'selected':''}>single option</option>
          </select>
        </div>
        <div class="field"><label>Key (used as $(key))</label><input type="text" value="${escAttr(i.key)}" oninput="updateInput('${i.id}','key',this.value)"></div>
      </div>
      <div class="field-row"><div class="field"><label>Label</label><input type="text" value="${escAttr(i.label)}" oninput="updateInput('${i.id}','label',this.value)"></div></div>
      ${i.type==='text' ? `
      <div class="field-row">
        <div class="field"><label>Max length</label><input type="number" value="${i.maxLength}" oninput="updateInput('${i.id}','maxLength',+this.value)"></div>
        <div class="field"><label>Width</label><input type="number" value="${i.width}" oninput="updateInput('${i.id}','width',+this.value)"></div>
        <div class="field chk"><input type="checkbox" ${i.multiline?'checked':''} onchange="updateInput('${i.id}','multiline',this.checked)"><label>Multiline</label></div>
      </div>` : ''}
      ${i.type==='number' ? `
      <div class="field-row">
        <div class="field"><label>Min</label><input type="number" value="${i.min}" oninput="updateInput('${i.id}','min',+this.value)"></div>
        <div class="field"><label>Max</label><input type="number" value="${i.max}" oninput="updateInput('${i.id}','max',+this.value)"></div>
        <div class="field"><label>Step</label><input type="number" value="${i.step}" oninput="updateInput('${i.id}','step',+this.value)"></div>
      </div>` : ''}
      ${i.type==='option' ? `
      <div class="field-row"><div class="field"><label>Options (separate with |)</label><input type="text" value="${escAttr((i.options||[]).join(' | '))}" oninput="updateInput('${i.id}','options',this.value.split('|').map(s=>s.trim()))"></div></div>
      ` : ''}
    `;
    el.appendChild(card);
  });
  const add = document.createElement('button'); add.className='add-btn'; add.textContent='+ Add input'; add.onclick=()=>addInput(); el.appendChild(add);
}

/* ============================================================
   BUTTONS editor
============================================================ */
function newButton(label,action){
  return {id:uid(), label:label||'<white>Button', tooltip:'', width:100, action:action||'close', target:'', command:'', commandTemplate:'', url:'', value:'', actionKey:''};
}
function actionFieldsHtml(btn, updateFn){
  const a = btn.action;
  if(a==='open-menu') return `<div class="field"><label>Target menu id</label><input type="text" value="${escAttr(btn.target)}" oninput="${updateFn}('target',this.value)"></div>`;
  if(a==='static-run-command') return `<div class="field"><label>Command (static, built once)</label><input type="text" value="${escAttr(btn.command)}" oninput="${updateFn}('command',this.value)"></div>`;
  if(a==='command-template') return `<div class="field"><label>Command template — $(key) for live inputs</label><input type="text" value="${escAttr(btn.commandTemplate)}" oninput="${updateFn}('commandTemplate',this.value)"></div>`;
  if(a==='static-open-url') return `<div class="field"><label>URL</label><input type="text" value="${escAttr(btn.url)}" oninput="${updateFn}('url',this.value)"></div>`;
  if(a==='static-copy'||a==='static-suggest') return `<div class="field"><label>Value</label><input type="text" value="${escAttr(btn.value)}" oninput="${updateFn}('value',this.value)"></div>`;
  return '';
}
function buttonCard(btn, updateFn, removeFn){
  const card = document.createElement('div'); card.className='item-card';
  card.innerHTML = `
    ${removeFn? `<button class="del" onclick="${removeFn}">✕</button>` : ''}
    <div class="field-row">
      <div class="field"><label>Label (MiniMessage)</label><input type="text" value="${escAttr(btn.label)}" oninput="${updateFn}('label',this.value)"></div>
      <div class="field"><label>Width</label><input type="number" value="${btn.width}" oninput="${updateFn}('width',+this.value)"></div>
    </div>
    <div class="field-row"><div class="field"><label>Tooltip (optional)</label><input type="text" value="${escAttr(btn.tooltip)}" oninput="${updateFn}('tooltip',this.value)"></div></div>
    <div class="field-row">
      <div class="field"><label>Action</label>
        <select onchange="${updateFn}('action',this.value)">
          ${['open-menu','close','back','static-run-command','command-template','static-open-url','static-copy','static-suggest','custom-click'].map(a=>`<option value="${a}" ${btn.action===a?'selected':''}>${a}</option>`).join('')}
        </select>
      </div>
      ${actionFieldsHtml(btn, updateFn)}
    </div>
    <div class="field-row"><div class="field"><label>Action key (optional)</label><input type="text" value="${escAttr(btn.actionKey)}" oninput="${updateFn}('actionKey',this.value)"></div></div>
  `;
  return card;
}
function addButton(list){ state[list].push(newButton()); renderButtons(); render(); }
function removeButton(list,id){ state[list] = state[list].filter(b=>b.id!==id); renderButtons(); render(); }
function updateButtonIn(list,id,key,val){ const b=state[list].find(x=>x.id===id); b[key]=val; renderButtons(); render(); }
function updateSingle(which,key,val){ if(!state[which]) return; state[which][key]=val; render(); }

function renderButtons(){
  const type = document.getElementById('f_type').value;
  const area = document.getElementById('buttonsArea');
  area.innerHTML='';

  if(type==='confirmation'){
    if(!state.confirmButton) state.confirmButton = newButton('<green>Confirm','close');
    if(!state.denyButton) state.denyButton = newButton('<gray>Cancel','close');
    area.innerHTML = '<small class="hint" style="margin-bottom:8px;display:block">confirmation type: exactly two buttons (confirm-button / deny-button), no buttons: list — matches vanilla two-button confirmation dialogs.</small>';
    const c1 = document.createElement('div'); c1.innerHTML='<label style="color:var(--gold);font-size:11px">confirm-button</label>'; area.appendChild(c1);
    area.appendChild(buttonCard(state.confirmButton, `(k,v)=>updateSingle('confirmButton',k,v)`));
    const c2 = document.createElement('div'); c2.innerHTML='<label style="color:var(--gold);font-size:11px">deny-button</label>'; area.appendChild(c2);
    area.appendChild(buttonCard(state.denyButton, `(k,v)=>updateSingle('denyButton',k,v)`));
  } else if(type==='notice'){
    if(!state.okButton) state.okButton = newButton('<green>OK','close');
    area.innerHTML = '<small class="hint" style="margin-bottom:8px;display:block">notice type: single ok-button only.</small>';
    area.appendChild(buttonCard(state.okButton, `(k,v)=>updateSingle('okButton',k,v)`));
  } else {
    const label1 = document.createElement('div'); label1.innerHTML='<label style="color:var(--gold);font-size:11px">buttons: (grid — order + columns = position)</label>';
    area.appendChild(label1);
    state.buttons.forEach(b=> area.appendChild(buttonCard(b, `(k,v)=>updateButtonIn('buttons','${b.id}',k,v)`, `removeButton('buttons','${b.id}')`)));
    const add1 = document.createElement('button'); add1.className='add-btn'; add1.textContent='+ Add button'; add1.onclick=()=>addButton('buttons'); area.appendChild(add1);

    const label2 = document.createElement('div'); label2.style.marginTop='10px'; label2.innerHTML='<label style="color:var(--gold);font-size:11px">footer-buttons: (still part of the same grid — merged in after buttons:)</label>';
    area.appendChild(label2);
    state.footerButtons.forEach(b=> area.appendChild(buttonCard(b, `(k,v)=>updateButtonIn('footerButtons','${b.id}',k,v)`, `removeButton('footerButtons','${b.id}')`)));
    const add2 = document.createElement('button'); add2.className='add-btn'; add2.textContent='+ Add footer button'; add2.onclick=()=>addButton('footerButtons'); area.appendChild(add2);

    area.appendChild(Object.assign(document.createElement('div'), {style:'margin-top:10px', innerHTML:'<label style="color:var(--gold);font-size:11px">ok-button: (optional — separate exit button below the grid)</label>'}));
    const okWrap = document.createElement('div');
    const okEnabled = document.createElement('label'); okEnabled.className='chk field'; okEnabled.style.marginBottom='6px';
    okEnabled.innerHTML = `<input type="checkbox" ${state.okButton?'checked':''} id="okToggle"><span>Include an exit button</span>`;
    okWrap.appendChild(okEnabled);
    area.appendChild(okWrap);
    document.getElementById('okToggle').onchange = (e)=>{
      state.okButton = e.target.checked ? (state.okButton||newButton('<gray>Close','close')) : null;
      renderButtons(); render();
    };
    if(state.okButton) area.appendChild(buttonCard(state.okButton, `(k,v)=>updateSingle('okButton',k,v)`));
  }
}

/* ============================================================
   PREVIEW — ported from misode's DialogPreview.tsx
   (src/app/components/previews/DialogPreview.tsx), rebuilt in
   vanilla JS against our own state model instead of Preact +
   vanilla dialog JSON.
============================================================ */
function px(n){ return `calc(var(--dialog-px) * ${n})`; }

function withTooltip(el, tooltipMM){
  if(!tooltipMM){ return el; }
  const wrap = document.createElement('div');
  wrap.className = 'tooltip-container';
  wrap.appendChild(el);
  const tip = document.createElement('div');
  tip.className = 'dialog-tooltip';
  tip.appendChild(renderTextComponent(tooltipMM));
  wrap.appendChild(tip);
  wrap.addEventListener('mousemove', (e)=>{
    requestAnimationFrame(()=>{
      tip.style.left = (e.offsetX + 20) + 'px';
      tip.style.top = (e.offsetY - 10) + 'px';
    });
  });
  return wrap;
}

function makeButton(label, width, tooltip){
  const btn = document.createElement('div');
  btn.className = 'dialog-button';
  btn.style.width = px(clamp(width,1,1024));
  btn.style.height = px(20);
  btn.appendChild(renderTextComponent(label, {oneline:true}));
  return withTooltip(btn, tooltip);
}
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }

function columnsGrid(columns, items){
  const grid = document.createElement('div');
  const totalCount = items.length;
  const gridCount = Math.floor(totalCount/columns) * columns;
  grid.style.cssText = `padding-top:${px(4)};display:grid;grid-template-columns:repeat(${columns},auto);gap:${px(2)};justify-content:center;justify-items:center;`;
  items.slice(0,gridCount).forEach(it=>grid.appendChild(it));
  if(totalCount>gridCount){
    const row = document.createElement('div');
    row.style.cssText = `grid-column:span ${columns};display:flex;gap:${px(2)};justify-content:center;`;
    items.slice(gridCount).forEach(it=>row.appendChild(it));
    grid.appendChild(row);
  }
  return grid;
}

function dialogTitle(title){
  const wrap = document.createElement('div');
  wrap.style.cssText = `height:${px(33)};display:flex;gap:${px(10)};justify-content:center;align-items:center`;
  wrap.appendChild(renderTextComponent(title));
  const warn = document.createElement('div');
  warn.className = 'dialog-warning-button';
  warn.style.cssText = `width:${px(20)};height:${px(20)}`;
  wrap.appendChild(withTooltip(warn, '<gray>This is a custom screen. Click here to learn more.'));
  return wrap;
}

function dialogBodyEl(bodyArr){
  const frag = document.createDocumentFragment();
  (bodyArr||[]).forEach(b=>{
    if(b.type==='plain-message'){
      const d = document.createElement('div');
      d.className = 'dialog-body';
      d.style.cssText = `max-width:${px(clamp(b.width??200,1,1024))};padding:${px(4)}`;
      d.appendChild(renderTextComponent(b.content));
      frag.appendChild(d);
    } else {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:${px(4)};align-items:center`;
      const iconOuter = document.createElement('div');
      iconOuter.style.cssText = `width:${px(clamp(b.width??16,1,256))};height:${px(clamp(b.height??16,1,256))};display:flex;align-items:center;justify-content:center`;
      const icon = document.createElement('div');
      icon.className = 'dialog-item-icon';
      icon.style.cssText = `width:${px(16)};height:${px(16)}`;
      const abbr = document.createElement('span');
      abbr.style.fontSize = px(6);
      abbr.textContent = (b.material||'?').split('_').map(w=>w[0]).slice(0,3).join('');
      icon.appendChild(abbr);
      iconOuter.appendChild(withTooltip(icon, b.showTooltip!==false ? (b.name || b.material) : null));
      row.appendChild(iconOuter);
      if(b.name || (b.lore&&b.lore.length)){
        const desc = document.createElement('div');
        desc.style.maxWidth = px(clamp(b.width??200,1,1024));
        desc.appendChild(renderTextComponent(b.name||''));
        row.appendChild(desc);
      }
      frag.appendChild(row);
    }
  });
  return frag;
}

function dialogInputsEl(inputs){
  const frag = document.createDocumentFragment();
  (inputs||[]).forEach(i=>{
    if(i.type==='boolean'){
      const d = document.createElement('div');
      d.style.cssText = `display:flex;gap:${px(4)};align-items:center`;
      const box = document.createElement('div');
      box.className = 'dialog-checkbox' + (i.initial?' dialog-selected':'');
      box.style.cssText = `width:${px(17)};height:${px(17)}`;
      d.appendChild(box);
      d.appendChild(renderTextComponent(i.label));
      frag.appendChild(d);
    } else if(i.type==='number'){
      const d = document.createElement('div');
      d.className = 'dialog-slider';
      d.style.cssText = `width:${px(clamp(i.width??200,1,1024))};height:${px(20)}`;
      const track = document.createElement('div'); track.className='dialog-slider-track';
      const handle = document.createElement('div'); handle.className='dialog-slider-handle';
      const textWrap = document.createElement('div'); textWrap.className='dialog-slider-text';
      const initial = (i.min + i.max) / 2;
      textWrap.appendChild(renderTextComponent(`${stripTags(i.label)}: ${initial}`));
      d.append(track, handle, textWrap);
      frag.appendChild(d);
    } else if(i.type==='option'){
      const first = (i.options||[])[0] || '';
      frag.appendChild(makeButton(`${stripTags(i.label)}: ${first}`, clamp(i.width??200,1,1024)));
    } else { // text
      const d = document.createElement('div');
      d.style.cssText = `display:flex;flex-direction:column;gap:${px(4)}`;
      d.appendChild(renderTextComponent(i.label));
      const box = document.createElement('div');
      box.className = 'dialog-edit-box';
      const height = i.multiline ? (9*Math.max(4,1)+8) : 20;
      box.style.cssText = `width:${px(clamp(i.width??200,1,1024))};height:${px(height)}`;
      if(i.initial) box.appendChild(renderTextComponent(i.initial));
      d.appendChild(box);
      frag.appendChild(d);
    }
  });
  return frag;
}

function dialogActionsEl(type, buttons, columns){
  if(type!=='multiAction' || !buttons.length) return document.createDocumentFragment();
  return columnsGrid(columns, buttons.map(b=>makeButton(b.label, b.width, b.tooltip)));
}

function dialogFooterEl(type){
  const frag = document.createDocumentFragment();
  if(type==='confirmation'){
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;gap:${px(8)};justify-content:center`;
    wrap.appendChild(makeButton(state.confirmButton?.label||'<green>Confirm', state.confirmButton?.width||150, state.confirmButton?.tooltip));
    wrap.appendChild(makeButton(state.denyButton?.label||'<gray>Cancel', state.denyButton?.width||150, state.denyButton?.tooltip));
    frag.appendChild(wrap);
  } else if(type==='notice'){
    const wrap = document.createElement('div');
    wrap.style.cssText = `display:flex;gap:${px(8)};justify-content:center`;
    wrap.appendChild(makeButton(state.okButton?.label||'<white>OK', state.okButton?.width||150, state.okButton?.tooltip));
    frag.appendChild(wrap);
  } else if(type==='multiAction' && state.okButton){
    frag.appendChild(makeButton(state.okButton.label, 200, state.okButton.tooltip));
  }
  return frag;
}

function renderPreview(){
  const type = document.getElementById('f_type').value;
  const title = document.getElementById('f_title').value;
  const columns = Math.max(1, +document.getElementById('f_columns').value || 1);
  const hasExit = type==='multiAction' && !!state.okButton;
  const footerHeight = (type==='multiAction' && !hasExit) ? 5 : 33;

  const dialog = document.getElementById('previewDialog');
  dialog.innerHTML = '';
  dialog.className = 'dialog-preview';

  const img = document.createElement('img');
  img.src = './assets/background.webp'; img.alt=''; img.draggable=false;
  dialog.appendChild(img);

  const inner = document.createElement('div');
  inner.style.cssText = 'top:0;left:0;width:100%;height:100%';
  inner.appendChild(dialogTitle(title));

  const midWrap = document.createElement('div');
  midWrap.style.cssText = `display:flex;flex-direction:column;gap:${px(10)};align-items:center;overflow-y:auto;height:calc(100% - ${px(33+footerHeight)})`;
  midWrap.appendChild(dialogBodyEl(state.body));
  midWrap.appendChild(dialogInputsEl(state.inputs));
  const allButtons = type==='multiAction' ? [...state.buttons, ...state.footerButtons] : [];
  midWrap.appendChild(dialogActionsEl(type, allButtons, columns));
  inner.appendChild(midWrap);

  const footWrap = document.createElement('div');
  footWrap.style.cssText = `bottom:0;left:0;width:100%;height:${px(footerHeight)};display:flex;justify-content:center;align-items:center`;
  footWrap.appendChild(dialogFooterEl(type));
  inner.appendChild(footWrap);

  dialog.appendChild(inner);

  updateDialogPx();
}
function updateDialogPx(){
  const wrap = document.getElementById('previewDialog');
  if(!wrap) return;
  const width = Math.floor(wrap.clientWidth || 360);
  wrap.style.setProperty('--dialog-px', `${width/400}px`);
}
window.addEventListener('resize', updateDialogPx);

/* ============================================================
   YML generation
============================================================ */
function ymlButtonFields(b){
  let lines = [`label: ${q(b.label)}`];
  if(b.tooltip) lines.push(`tooltip: ${q(b.tooltip)}`);
  lines.push(`width: ${b.width}`);
  lines.push(`action: ${b.action}`);
  if(b.action==='open-menu') lines.push(`target: ${q(b.target)}`);
  if(b.action==='static-run-command') lines.push(`command: ${q(b.command)}`);
  if(b.action==='command-template') lines.push(`command-template: ${q(b.commandTemplate)}`);
  if(b.action==='static-open-url') lines.push(`url: ${q(b.url)}`);
  if(b.action==='static-copy'||b.action==='static-suggest') lines.push(`value: ${q(b.value)}`);
  if(b.actionKey) lines.push(`action-key: ${q(b.actionKey)}`);
  return lines;
}
function ymlButtonBlock(b, indent){
  const pad = ' '.repeat(indent);
  return ymlButtonFields(b).map(l => pad + l).join('\n');
}
function ymlButtonListItem(b, indent){
  const pad = ' '.repeat(indent);
  const fields = ymlButtonFields(b);
  const first = `${pad}- ${fields[0]}`;
  const rest = fields.slice(1).map(l => `${pad}  ${l}`);
  return [first, ...rest].join('\n');
}

function generateYml(){
  const id = document.getElementById('f_id').value.trim() || 'my-menu';
  const type = document.getElementById('f_type').value;
  const title = document.getElementById('f_title').value;
  const extTitle = document.getElementById('f_extTitle').value;
  const cmd = document.getElementById('f_cmd').value;
  const columns = +document.getElementById('f_columns').value || 1;
  let pause = document.getElementById('f_pause').checked;
  const escape = document.getElementById('f_escape').checked;
  let afterAction = document.getElementById('f_afterAction').value;

  const warn = document.getElementById('pauseWarn');
  if(pause && afterAction==='NONE'){ warn.style.display='block'; pause=false; } else { warn.style.display='none'; }

  let l = [];
  l.push(`${id}:`);
  l.push(`  title: ${q(title)}`);
  if(extTitle) l.push(`  external-title: ${q(extTitle)}`);
  l.push(`  type: ${type}`);
  if(cmd) l.push(`  command: ${q(cmd)}`);
  l.push(`  can-close-escape: ${escape}`);
  l.push(`  pause: ${pause}`);
  l.push(`  after-action: ${afterAction}`);
  if(type==='multiAction') l.push(`  columns: ${columns}`);

  if(state.body.length){
    l.push(`  body:`);
    state.body.forEach(b=>{
      if(b.type==='plain-message'){
        l.push(`    - type: plain-message`);
        l.push(`      content: ${q(b.content)}`);
      } else {
        l.push(`    - type: item`);
        l.push(`      material: ${b.material}`);
        if(b.name) l.push(`      name: ${q(b.name)}`);
        if(b.lore && b.lore.length && b.lore.some(x=>x)){
          l.push(`      lore:`);
          b.lore.filter(x=>x).forEach(ln=> l.push(`        - ${q(ln)}`));
        }
        l.push(`      show-decorations: ${!!b.showDecorations}`);
        l.push(`      show-tooltip: ${!!b.showTooltip}`);
        l.push(`      width: ${b.width}`);
        l.push(`      height: ${b.height}`);
      }
    });
  }

  if(state.inputs.length){
    l.push(`  inputs:`);
    state.inputs.forEach(i=>{
      l.push(`    - type: ${i.type==='option'?'single-option':(i.type==='number'?'number-range':i.type)}`);
      l.push(`      key: ${q(i.key)}`);
      l.push(`      label: ${q(i.label)}`);
      if(i.type==='text'){
        l.push(`      max-length: ${i.maxLength}`);
        l.push(`      initial: ${q(i.initial||'')}`);
        l.push(`      width: ${i.width}`);
        l.push(`      multiline: ${!!i.multiline}`);
      } else if(i.type==='number'){
        l.push(`      min: ${i.min}`);
        l.push(`      max: ${i.max}`);
        l.push(`      step: ${i.step}`);
      } else if(i.type==='option'){
        l.push(`      options:`);
        (i.options||[]).filter(x=>x).forEach(o=> l.push(`        - ${q(o)}`));
      }
    });
  }

  if(type==='confirmation'){
    l.push(`  confirm-button:`); l.push(ymlButtonBlock(state.confirmButton,4));
    l.push(`  deny-button:`); l.push(ymlButtonBlock(state.denyButton,4));
  } else if(type==='notice'){
    l.push(`  ok-button:`); l.push(ymlButtonBlock(state.okButton,4));
  } else {
    if(state.buttons.length){
      l.push(`  buttons:`);
      state.buttons.forEach(b=> l.push(ymlButtonListItem(b,4)));
    }
    if(state.footerButtons.length){
      l.push(`  footer-buttons:`);
      state.footerButtons.forEach(b=> l.push(ymlButtonListItem(b,4)));
    }
    if(state.okButton){
      l.push(`  ok-button:`); l.push(ymlButtonBlock(state.okButton,4));
    }
  }
  return l.filter(x=>x!==undefined).join('\n');
}

function render(){
  const type = document.getElementById('f_type').value;
  document.getElementById('wrap_columns').style.display = type==='multiAction' ? '' : 'none';
  renderButtons();
  renderPreview();
  document.getElementById('ymlOut').value = generateYml();
}

function downloadYml(){
  const id = document.getElementById('f_id').value.trim() || 'my-menu';
  const blob = new Blob([document.getElementById('ymlOut').value], {type:'text/yaml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${id}.yml`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function copyYml(){ navigator.clipboard.writeText(document.getElementById('ymlOut').value); }

/* ============================================================
   Presets
============================================================ */
function loadPreset(name){
  state = { body:[], inputs:[], buttons:[], footerButtons:[], confirmButton:null, denyButton:null, okButton:null };
  document.getElementById('f_extTitle').value='';
  document.getElementById('f_cmd').value='';
  document.getElementById('f_escape').checked = true;

  if(name==='tpa'){
    document.getElementById('f_id').value='tpa-menu';
    document.getElementById('f_type').value='multiAction';
    document.getElementById('f_title').value='<#C21807>🌀 <b>Teleport Request</b>';
    document.getElementById('f_columns').value=1;
    document.getElementById('f_pause').checked=false;
    document.getElementById('f_afterAction').value='NONE';
    state.body.push({id:uid(),type:'plain-message',content:'<gray>Who would you like to send a request to?'});
    state.inputs.push({id:uid(),type:'text',key:'teleport_player',label:'<white>Player Name',maxLength:16,initial:'',width:150,multiline:false});
    const toggle = newButton('<gray>Request Type: TPA','open-menu'); toggle.width=200; toggle.target='tpahere-menu';
    const cancel = newButton('<gray>Cancel','close'); cancel.width=100; cancel.actionKey='dm:cancel';
    const send = newButton('<green>Send','command-template'); send.width=100; send.tooltip='<gray>Send teleport request'; send.commandTemplate='/tpa $(teleport_player)';
    state.buttons.push(toggle, cancel, send);
  } else if(name==='pay'){
    document.getElementById('f_id').value='pay-menu';
    document.getElementById('f_type').value='confirmation';
    document.getElementById('f_title').value='<green>💸 Send Money';
    document.getElementById('f_pause').checked=true;
    document.getElementById('f_afterAction').value='CLOSE';
    state.body.push({id:uid(),type:'plain-message',content:'<gray>Your balance: <gold>$%vault_eco_balance_formatted%'});
    state.inputs.push({id:uid(),type:'text',key:'target_player',label:'<white>Player Name',maxLength:16,initial:'',width:150,multiline:false});
    state.inputs.push({id:uid(),type:'text',key:'pay_amount',label:'<white>Amount',maxLength:10,initial:'',width:100,multiline:false});
    state.confirmButton = newButton('<green>Send','command-template'); state.confirmButton.width=120; state.confirmButton.tooltip='<gray>Send the money'; state.confirmButton.commandTemplate='/pay $(target_player) $(pay_amount)'; state.confirmButton.actionKey='dm:pay_confirm';
    state.denyButton = newButton('<gray>Cancel','close'); state.denyButton.width=100; state.denyButton.actionKey='dm:cancel';
  } else if(name==='kit'){
    document.getElementById('f_id').value='kit-preview-menu';
    document.getElementById('f_type').value='confirmation';
    document.getElementById('f_title').value='<gold>⚔ Kit: Warrior';
    document.getElementById('f_pause').checked=true;
    document.getElementById('f_afterAction').value='CLOSE';
    state.body.push({id:uid(),type:'item',material:'DIAMOND_SWORD',name:'<aqua>Warrior Sword',lore:['<gray>Sharpness V, Unbreaking III'],showDecorations:true,showTooltip:true,width:64,height:64});
    state.body.push({id:uid(),type:'item',material:'DIAMOND_CHESTPLATE',name:'<aqua>Warrior Chestplate',lore:['<gray>Protection IV, Unbreaking III'],showDecorations:true,showTooltip:true,width:64,height:64});
    state.confirmButton = newButton('<green>Claim Kit','static-run-command'); state.confirmButton.width=140; state.confirmButton.command='/kit warrior'; state.confirmButton.actionKey='dm:claim_kit';
    state.denyButton = newButton('<gray>Cancel','close'); state.denyButton.width=100; state.denyButton.actionKey='dm:cancel';
  } else if(name==='notice'){
    document.getElementById('f_id').value='rules-notice';
    document.getElementById('f_type').value='notice';
    document.getElementById('f_title').value='<yellow>Server Rules';
    document.getElementById('f_pause').checked=true;
    document.getElementById('f_afterAction').value='CLOSE';
    state.body.push({id:uid(),type:'plain-message',content:'<gray>1. Be respectful'});
    state.body.push({id:uid(),type:'plain-message',content:'<gray>2. No cheating'});
    state.body.push({id:uid(),type:'plain-message',content:'<gray>3. Have fun'});
    state.okButton = newButton('<green>I Understand','close'); state.okButton.width=140;
  } else {
    document.getElementById('f_id').value='my-menu';
    document.getElementById('f_type').value='multiAction';
    document.getElementById('f_title').value='<gold>My Menu';
    document.getElementById('f_pause').checked=true;
    document.getElementById('f_afterAction').value='CLOSE';
  }
  renderBodyList(); renderInputList(); render();
}

window.addEventListener('DOMContentLoaded', ()=> loadPreset('tpa'));
