/* ============================================================
 * 应用层：渲染、导航、表单绑定、实时计算、诊断与记录
 * ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const STORE_KEY = 'hldc_records';
  let currentId = null;
  let values = {};

  /* ---------- 视图切换 ---------- */
  function showView(id) {
    $$('.view').forEach(v => v.classList.remove('view--active'));
    $('#' + id).classList.add('view--active');
    const map = { 'view-home': ['家庭用电智能诊断器', '家用电器负荷计算'], 'view-calc': ['用电测算', '填写参数，实时估算'], 'view-result': ['节能诊断', '基于系数的用电分析'], 'view-mine': ['我的', '用电总览与记录'] };
    if (map[id]) { $('#appTitle').textContent = map[id][0]; $('#appSub').textContent = map[id][1]; }
    $$('.tab').forEach(t => t.classList.toggle('tab--active', t.dataset.view === id));
    window.scrollTo(0, 0);
  }

  /* ---------- 设备选择首页 ---------- */
  function renderHome() {
    const grid = $('#deviceGrid');
    grid.innerHTML = '';
    DEVICE_ORDER.forEach(id => {
      const d = DEVICES[id];
      const el = document.createElement('div');
      el.className = 'device' + (d.demo ? ' device--on' : '');
      el.innerHTML = `<div class="device__icon">${d.icon}</div>
        <div class="device__name">${d.name}</div>
        <div class="device__tag">${d.demo ? '范例' : '可测算'}</div>`;
      el.addEventListener('click', () => openDevice(id));
      grid.appendChild(el);
    });
  }

  /* ---------- 打开某设备计算页 ---------- */
  function openDevice(id) {
    currentId = id;
    const dev = DEVICES[id];
    values = Engine.defaults(dev);

    $('#calcIcon').textContent = dev.icon;
    $('#calcName').textContent = dev.name;
    $('#calcDesc').textContent = dev.desc;

    // 预设功率
    const presets = $('#presets');
    presets.innerHTML = '';
    (dev.presets || []).forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset' + (p === dev.params[0].default ? ' preset--active' : '');
      b.textContent = p + 'W';
      b.addEventListener('click', () => {
        values.power = p;
        $('#f_power').value = p;
        $$('.preset').forEach(x => x.classList.remove('preset--active'));
        b.classList.add('preset--active');
        live();
      });
      presets.appendChild(b);
    });

    renderForm(dev);
    live();
    showView('view-calc');
  }

  /* ---------- 渲染表单（参数 + 分组因子） ---------- */
  function renderForm(dev) {
    const form = $('#calcForm');
    form.innerHTML = '';

    // 基础参数卡片
    const pCard = card('⚙️ 设备参数');
    dev.params.forEach(p => pCard.appendChild(field(p.key, p.label, p.unit, p)));
    form.appendChild(pCard);

    // 因子按 group 分组
    const groups = [];
    dev.factors.forEach(f => { if (!groups.includes(f.group)) groups.push(f.group); });
    groups.forEach(g => {
      const c = card('📋 ' + g);
      dev.factors.filter(f => f.group === g).forEach(f => c.appendChild(selectField(f)));
      form.appendChild(c);
    });
  }

  function card(title) {
    const c = document.createElement('div');
    c.className = 'card';
    const h = document.createElement('div');
    h.className = 'card__title';
    h.textContent = title;
    c.appendChild(h);
    return c;
  }

  function field(key, label, unit, p) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<label class="field__label">${label}</label>
      <div class="field__row">
        <input class="input" id="f_${key}" type="number" value="${p.default}"
          min="${p.min != null ? p.min : ''}" max="${p.max != null ? p.max : ''}" step="${p.step || 1}" />
        <span class="field__suffix">${unit}</span>
      </div>`;
    wrap.querySelector('input').addEventListener('input', e => {
      values[key] = e.target.value;
      if (key === 'power') $$('.preset').forEach(x => x.classList.remove('preset--active'));
      live();
    });
    return wrap;
  }

  function selectField(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const opts = f.options.map(o => `<option value="${o.value}" ${o.value === f.default ? 'selected' : ''}>${o.label}</option>`).join('');
    wrap.innerHTML = `<label class="field__label">${f.label}</label>
      <select class="select" id="f_${f.key}">${opts}</select>`;
    wrap.querySelector('select').addEventListener('change', e => {
      values[f.key] = e.target.value;
      live();
    });
    return wrap;
  }

  /* ---------- 实时计算（更新底部结算条） ---------- */
  function live() {
    if (!currentId) return;
    const dev = DEVICES[currentId];
    const { kwh, cost } = Engine.calc(dev, values);
    $('#rKwh').textContent = kwh.toFixed(2);
    $('#rCost').textContent = cost.toFixed(2);
  }

  /* ---------- 诊断 ---------- */
  function diagnose() {
    if (!currentId) return;
    const dev = DEVICES[currentId];
    const { kwh, cost } = Engine.calc(dev, values);
    const best = Engine.bestKwh(dev, values);
    const savingKwh = Math.max(0, kwh - best);
    const savingCost = savingKwh * APP_CONFIG.price;

    // 环形图
    const ringMax = dev.ringMax || APP_CONFIG.ringMax;
    const pct = Math.min(kwh / ringMax, 1);
    const C = 2 * Math.PI * 52;
    $('#ringFg').style.strokeDashoffset = (C * (1 - pct)).toFixed(1);

    $('#ringKwh').textContent = kwh.toFixed(1);
    $('#resDevice').textContent = dev.name;
    $('#resCost').textContent = cost.toFixed(2) + ' 元';
    $('#resSaving').textContent = savingCost.toFixed(2) + ' 元';

    // 建议
    const tips = Engine.diagnose(dev, values);
    const box = $('#tips');
    box.innerHTML = '';
    tips.forEach(t => {
      const el = document.createElement('div');
      el.className = 'tip' + (t.level === 'warn' ? ' tip--warn' : t.level === 'danger' ? ' tip--danger' : '');
      el.innerHTML = `<div class="tip__icon">${t.icon}</div>
        <div class="tip__body"><b>${t.title}</b><p>${t.text}</p></div>`;
      box.appendChild(el);
    });

    saveRecord(dev, kwh, cost);
    showView('view-result');
  }

  /* ---------- 记录（localStorage，按设备保留最新） ---------- */
  function loadRecords() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveRecords(o) { localStorage.setItem(STORE_KEY, JSON.stringify(o)); }
  function saveRecord(dev, kwh, cost) {
    const o = loadRecords();
    o[dev.id] = { id: dev.id, name: dev.name, icon: dev.icon, kwh, cost, date: new Date().toLocaleString('zh-CN') };
    saveRecords(o);
  }
  function renderMine() {
    const o = loadRecords();
    const list = Object.values(o);
    const sumKwh = list.reduce((s, r) => s + r.kwh, 0);
    const sumCost = sumKwh * APP_CONFIG.price;
    $('#sumKwh').textContent = sumKwh.toFixed(1);
    $('#sumCost').textContent = sumCost.toFixed(2);
    const box = $('#recordList');
    box.innerHTML = '';
    if (list.length === 0) {
      box.innerHTML = '<div class="empty">还没有测算记录，去“设备”选择家电测算吧～</div>';
      return;
    }
    list.forEach(r => {
      const el = document.createElement('div');
      el.className = 'record';
      el.innerHTML = `<div class="record__icon">${r.icon}</div>
        <div class="record__info"><b>${r.name}</b><p>${r.date}</p></div>
        <div class="record__val"><b>${r.kwh.toFixed(1)} kWh</b><p>¥${r.cost.toFixed(2)}</p></div>`;
      box.appendChild(el);
    });
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      const v = t.dataset.view;
      if (v === 'view-mine') renderMine();
      showView(v);
    }));
    $('#calcBack').addEventListener('click', () => showView('view-home'));
    $('#resultBack').addEventListener('click', () => showView('view-calc'));
    $('#btnDiagnose').addEventListener('click', diagnose);
    $('#btnClear').addEventListener('click', () => { saveRecords({}); renderMine(); });
  }

  /* ---------- 启动 ---------- */
  renderHome();
  bind();
  showView('view-home');
})();
