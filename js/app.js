/* ============================================================
 * 应用层：渲染、导航、表单绑定、实时计算、诊断与记录
 * ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const STORE_INST = 'hldc_instances';
  let currentId = null;
  let currentIid = null;
  let detailType = null;
  let values = {};

  /* ---------- 视图切换 ---------- */
  function showView(id) {
    $$('.view').forEach(v => v.classList.remove('view--active'));
    $('#' + id).classList.add('view--active');
    const map = { 'view-home': ['家庭用电智能诊断器', '家用电器负荷计算'], 'view-calc': ['用电测算', '填写参数，实时估算'], 'view-result': ['节能诊断', '基于系数的用电分析'], 'view-owned': ['我的设备', '已选设备与数量'] };
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
  function openDevice(id, iid) {
    currentId = id;
    currentIid = iid || null;
    const dev = DEVICES[id];
    let cfg = null;
    if (iid) {
      const inst = loadInst().find(x => x.iid === iid);
      if (inst) cfg = inst.config;
    }
    values = cfg ? Object.assign({}, cfg) : Engine.defaults(dev);

    $('#calcIcon').textContent = dev.icon;
    $('#calcName').textContent = dev.name;
    $('#calcDesc').textContent = dev.desc;
    $('#btnAdd').textContent = iid ? '保存修改' : '添加设备';

    // 预设功率
    const presets = $('#presets');
    presets.innerHTML = '';
    (dev.presets || []).forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset' + (p === Number(values.power) ? ' preset--active' : '');
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
        <input class="input" id="f_${key}" type="number" value="${values[key] != null ? values[key] : p.default}"
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
    const cur = values[f.key] != null ? Number(values[f.key]) : f.default;
    const opts = f.options.map(o => `<option value="${o.value}" ${o.value === cur ? 'selected' : ''}>${o.label}</option>`).join('');
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

    if (currentIid) {
      const arr = loadInst();
      const inst = arr.find(x => x.iid === currentIid);
      if (inst) { inst.config = Object.assign({}, values); saveInst(arr); }
    }
    showView('view-result');
  }

  /* ---------- 我的设备（localStorage：独立实例列表） ---------- */
  function loadInst() {
    try { return JSON.parse(localStorage.getItem(STORE_INST)) || []; }
    catch (e) { return []; }
  }
  function saveInst(arr) { localStorage.setItem(STORE_INST, JSON.stringify(arr)); }
  function genIid(type) { return type + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  function onAddOrSave() {
    if (!currentId) return;
    const arr = loadInst();
    if (currentIid) {
      const inst = arr.find(x => x.iid === currentIid);
      if (inst) inst.config = Object.assign({}, values);
      saveInst(arr);
      toast('已保存修改');
      detailType = currentId;
    } else {
      arr.push({ iid: genIid(currentId), type: currentId, config: Object.assign({}, values) });
      saveInst(arr);
      toast('已添加 ' + DEVICES[currentId].name);
      detailType = null;
    }
    renderOwned();
    showView('view-owned');
  }

  function removeInstance(iid) {
    saveInst(loadInst().filter(x => x.iid !== iid));
    renderOwned();
  }

  function renderOwned() {
    const arr = loadInst();
    const box = $('#ownedList');
    box.innerHTML = '';

    // 全屋汇总
    let totalKwh = 0, totalCount = 0;
    arr.forEach(it => { if (DEVICES[it.type]) { totalCount++; totalKwh += Engine.calc(DEVICES[it.type], it.config).kwh; } });
    $('#ownCount').textContent = totalCount;
    $('#ownKwh').textContent = totalKwh.toFixed(1);
    $('#ownCost').textContent = (totalKwh * APP_CONFIG.price).toFixed(2);
    const badge = $('#ownBadge');
    if (totalCount > 0) { badge.hidden = false; badge.textContent = totalCount; }
    else { badge.hidden = true; }

    if (detailType) {
      // 二级：某类型的实例列表
      $('#ownedBack').style.display = '';
      $('#ownedTitle').textContent = DEVICES[detailType].name + '（' + arr.filter(x => x.type === detailType).length + '）';
      $('#ownedSub').textContent = '每台可独立编辑或删除';
      $('#ownedSummary').style.display = 'none';
      $('#btnClearOwned').textContent = '返回上级';
      const list = arr.filter(x => x.type === detailType);
      if (list.length === 0) {
        box.innerHTML = '<div class="empty">该类型暂无设备</div>';
      } else {
        list.forEach((it, idx) => {
          const k = Engine.calc(DEVICES[it.type], it.config).kwh;
          const el = document.createElement('div');
          el.className = 'record';
          el.innerHTML = `<div class="record__icon">${DEVICES[it.type].icon}</div>
            <div class="record__info"><b>${DEVICES[it.type].name} #${idx + 1}</b><p>单台 ${k.toFixed(1)} kWh/月</p></div>
            <button class="record__del" data-iid="${it.iid}" aria-label="删除">🗑</button>`;
          el.addEventListener('click', e => {
            if (e.target.closest('.record__del')) return;
            openDevice(it.type, it.iid);
          });
          el.querySelector('.record__del').addEventListener('click', e => {
            e.stopPropagation();
            removeInstance(it.iid);
          });
          box.appendChild(el);
        });
      }
    } else {
      // 一级：按类型聚类
      $('#ownedBack').style.display = 'none';
      $('#ownedTitle').textContent = '我的设备';
      $('#ownedSub').textContent = '按类型聚类，点击进入查看每台';
      $('#ownedSummary').style.display = '';
      $('#btnClearOwned').textContent = '清空全部';
      const groups = {};
      arr.forEach(it => { if (DEVICES[it.type]) (groups[it.type] = groups[it.type] || []).push(it); });
      const ids = Object.keys(groups);
      if (ids.length === 0) {
        box.innerHTML = '<div class="empty">还没添加设备，去“设备”选择家电吧～</div>';
      } else {
        ids.forEach(id => {
          const list = groups[id];
          const k = list.reduce((s, it) => s + Engine.calc(DEVICES[id], it.config).kwh, 0);
          const el = document.createElement('div');
          el.className = 'record owned-cluster';
          el.dataset.type = id;
          el.innerHTML = `<div class="record__icon">${DEVICES[id].icon}</div>
            <div class="record__info"><b>${DEVICES[id].name}</b><p>共 ${k.toFixed(1)} kWh/月</p></div>
            <div class="cluster-badge">×${list.length}</div>`;
          el.addEventListener('click', () => { detailType = id; renderOwned(); });
          box.appendChild(el);
        });
      }
    }
  }

  /* ---------- 轻提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('toast--show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('toast--show'), 1500);
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      const v = t.dataset.view;
      if (v === 'view-owned') { detailType = null; renderOwned(); }
      else if (v === 'view-result' && currentId) { diagnose(); }
      showView(v);
    }));
    $('#calcBack').addEventListener('click', () => showView('view-home'));
    $('#resultBack').addEventListener('click', () => showView('view-calc'));
    $('#btnAdd').addEventListener('click', onAddOrSave);
    $('#ownedBack').addEventListener('click', () => { detailType = null; renderOwned(); });
    $('#btnClearOwned').addEventListener('click', () => {
      if (detailType) { detailType = null; renderOwned(); }
      else { saveInst([]); detailType = null; renderOwned(); }
    });
  }

  /* ---------- 启动 ---------- */
  renderHome();
  bind();
  showView('view-home');
})();
