/* ============================================================
 * 应用层：渲染、导航、表单绑定、实时计算、单台/全屋诊断与记录
 * ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const STORE_INST = 'hldc_instances';
  const STORE_VER = 'hldc_version';
  const SCHEMA_VERSION = '3'; // 字段结构变更时递增，旧数据直接重置

  let currentId = null;
  let currentIid = null;
  let detailType = null;
  let values = {};

  /* ---------- 数据存取（版本不符自动清空旧结构） ---------- */
  function migrate() {
    if (localStorage.getItem(STORE_VER) !== SCHEMA_VERSION) {
      localStorage.removeItem(STORE_INST);
      localStorage.setItem(STORE_VER, SCHEMA_VERSION);
    }
  }
  function loadInst() {
    try { return JSON.parse(localStorage.getItem(STORE_INST)) || []; }
    catch (e) { return []; }
  }
  function saveInst(arr) { localStorage.setItem(STORE_INST, JSON.stringify(arr)); }
  function genIid(type) { return type + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

  /* ---------- 视图切换 ---------- */
  function showView(id) {
    $$('.view').forEach(v => v.classList.remove('view--active'));
    $('#' + id).classList.add('view--active');
    const map = {
      'view-home': ['家庭用电智能诊断器', '家用电器负荷计算'],
      'view-calc': ['用电测算', '填写参数，实时估算'],
      'view-result': ['节能诊断', '基于模型的用电分析'],
      'view-owned': ['我的设备', '已选设备与数量'],
      'view-house': ['全屋诊断', '汇总所有已添加设备'],
    };
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
        <div class="device__tag">${d.model === 'hot_water' || d.model === 'always_on' ? '新' : '可测算'}</div>`;
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

    // 通用预设（目标字段由 presets.key 指定）
    const presets = $('#presets');
    presets.innerHTML = '';
    const ps = dev.presets;
    if (ps && ps.items && ps.items.length) {
      ps.items.forEach(item => {
        const val = typeof item === 'object' ? item.value : item;
        const label = typeof item === 'object' ? item.label : (val + (ps.unit || 'W'));
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'preset' + (val === Number(values[ps.key]) ? ' preset--active' : '');
        b.textContent = label;
        b.addEventListener('click', () => {
          values[ps.key] = val;
          const inp = $('#f_' + ps.key);
          if (inp) inp.value = val;
          $$('.preset').forEach(x => x.classList.remove('preset--active'));
          b.classList.add('preset--active');
          live();
        });
        presets.appendChild(b);
      });
    } else {
      presets.style.display = 'none';
    }
    if (ps && ps.items && ps.items.length) presets.style.display = '';

    renderForm(dev);
    live();
    showView('view-calc');
  }

  /* ---------- 渲染表单（按 group 分卡片） ---------- */
  function renderForm(dev) {
    const form = $('#calcForm');
    form.innerHTML = '';

    const GROUP_TITLES = {
      usage: '⚙️ 使用情况',
      identity: '🏷️ 设备信息',
      behavior: '🎛️ 使用习惯（可优化）',
      env: '🌤️ 环境与建筑（短期难改）',
    };

    // 保持首次出现顺序分组
    const order = [];
    const groups = {};
    dev.fields.forEach(f => {
      if (!groups[f.group]) { groups[f.group] = []; order.push(f.group); }
      groups[f.group].push(f);
    });

    order.forEach(g => {
      const c = card(GROUP_TITLES[g] || g);
      groups[g].forEach(f => c.appendChild(f.type === 'number' ? numField(f) : selectField(f)));
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

  function numField(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<label class="field__label" for="f_${f.key}">${f.label}</label>
      <div class="field__row">
        <input class="input" id="f_${f.key}" type="number" inputmode="decimal" value="${values[f.key] != null ? values[f.key] : f.default}"
          min="${f.min != null ? f.min : ''}" max="${f.max != null ? f.max : ''}" step="${f.step || 1}" />
        ${f.unit ? `<span class="field__suffix">${f.unit}</span>` : ''}
      </div>`;
    wrap.querySelector('input').addEventListener('input', e => {
      values[f.key] = e.target.value;
      if (f.key === 'power') $$('.preset').forEach(x => x.classList.remove('preset--active'));
      live();
    });
    return wrap;
  }

  function selectField(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const cur = values[f.key] != null ? Number(values[f.key]) : f.default;
    const opts = f.options.map(o =>
      `<option value="${o.value}" ${o.value === cur ? 'selected' : ''}>${o.label}</option>`).join('');
    wrap.innerHTML = `<label class="field__label" for="f_${f.key}">${f.label}</label>
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
    const { kwh } = Engine.calc(dev, values);
    $('#rKwh').textContent = kwh.toFixed(2);
    $('#rCost').textContent = (kwh * APP_CONFIG.price).toFixed(2);
  }

  /* ---------- 单台设备诊断 ---------- */
  function diagnose() {
    if (!currentId) return;
    const dev = DEVICES[currentId];
    const { kwh } = Engine.calc(dev, values);
    const best = Engine.bestKwh(dev, values);
    const savingKwh = Math.max(0, kwh - best);
    const savingCost = savingKwh * APP_CONFIG.price;

    const ringMax = dev.ringMax || APP_CONFIG.ringMax;
    const pct = Math.min(kwh / ringMax, 1);
    const C = 2 * Math.PI * 52;
    $('#ringFg').style.strokeDashoffset = (C * (1 - pct)).toFixed(1);

    $('#ringKwh').textContent = kwh.toFixed(1);
    $('#resDevice').textContent = dev.name;
    $('#resCost').textContent = (kwh * APP_CONFIG.price).toFixed(2) + ' 元';
    $('#resSaving').textContent = savingCost.toFixed(1) + ' 元';

    const tips = Engine.diagnose(dev, values);
    const box = $('#tips');
    box.innerHTML = '';
    tips.forEach(t => box.appendChild(tipEl(t)));

    if (currentIid) {
      const arr = loadInst();
      const inst = arr.find(x => x.iid === currentIid);
      if (inst) { inst.config = Object.assign({}, values); saveInst(arr); }
    }
    showView('view-result');
  }

  /* ---------- 全屋诊断（诊断 Tab） ---------- */
  function renderHouse() {
    const arr = loadInst();
    const summary = $('#houseSummary');
    const rankBox = $('#houseRank');
    const tipBox = $('#houseTips');

    if (arr.length === 0) {
      summary.style.display = 'none';
      rankBox.innerHTML = '<div class="empty">还没添加设备。先去「设备」添加家电，再回来看全屋用电分析～</div>';
      tipBox.innerHTML = '';
      return;
    }

    // 逐实例计算并排名
    const rows = [];
    let totalKwh = 0, totalSave = 0;
    arr.forEach(it => {
      const dev = DEVICES[it.type];
      if (!dev) return;
      const { kwh } = Engine.calc(dev, it.config);
      const best = Engine.bestKwh(dev, it.config);
      const save = Math.max(0, kwh - best);
      totalKwh += kwh; totalSave += save;
      rows.push({ dev, kwh, save, count: 1 });
    });

    summary.style.display = '';
    $('#hsCount').textContent = String(rows.length);
    $('#hsKwh').textContent = totalKwh.toFixed(1);
    $('#hsCost').textContent = (totalKwh * APP_CONFIG.price).toFixed(2);
    $('#hsSave').textContent = (totalSave * APP_CONFIG.price).toFixed(1);

    rows.sort((a, b) => b.kwh - a.kwh);
    const max = rows.length ? rows[0].kwh : 0;
    rankBox.innerHTML = '';
    rows.forEach(r => {
      const el = document.createElement('div');
      el.className = 'rank-row';
      const pct = max > 0 ? Math.round(r.kwh / max * 100) : 0;
      const share = totalKwh > 0 ? Math.round(r.kwh / totalKwh * 100) : 0;
      el.innerHTML = `
        <div class="rank-head">
          <span>${r.dev.icon} ${r.dev.name}</span>
          <span><b>${r.kwh.toFixed(1)}</b> kWh · 占${share}%</span>
        </div>
        <div class="rank-bar"><i style="width:${pct}%"></i></div>
        ${r.save > 0.05 ? `<div class="rank-save">省电潜力约 ${(r.save * APP_CONFIG.price).toFixed(1)} 元/月</div>` : ''}`;
      rankBox.appendChild(el);
    });

    // 聚合建议：warn/danger 优先，每台最多取前2条，总量限10条
    const all = [];
    rows.forEach(r => {
      const inst = arr.find(x => x.type === r.dev.id);
      const tips = Engine.diagnose(r.dev, inst ? inst.config : Engine.defaults(r.dev))
        .filter(t => t.level !== 'info' || t.title !== '当前设置较优');
      tips.slice(0, 2).forEach(t => all.push({ dev: r.dev, t }));
    });
    all.sort((a, b) => ({ danger: 0, warn: 1, info: 2 })[a.t.level] - ({ danger: 0, warn: 1, info: 2 })[b.t.level]);
    tipBox.innerHTML = '';
    all.slice(0, 10).forEach(({ dev, t }) => {
      const el = tipEl(t);
      const tag = document.createElement('div');
      tag.className = 'tip__dev';
      tag.textContent = dev.icon + ' ' + dev.name;
      el.querySelector('.tip__body').prepend(tag);
      tipBox.appendChild(el);
    });
    if (!all.length) {
      tipBox.innerHTML = '<div class="tip"><div class="tip__icon">✅</div><div class="tip__body"><b>整体表现良好</b><p>当前各设备设置均较优。</p></div></div>';
    }
  }

  function tipEl(t) {
    const el = document.createElement('div');
    el.className = 'tip' + (t.level === 'warn' ? ' tip--warn' : t.level === 'danger' ? ' tip--danger' : '');
    el.innerHTML = `<div class="tip__icon">${t.icon}</div>
      <div class="tip__body"><b>${t.title}</b><p>${t.text}</p></div>`;
    return el;
  }

  /* ---------- 我的设备（聚类 + 下钻） ---------- */
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

    let totalKwh = 0, totalCount = 0;
    arr.forEach(it => { if (DEVICES[it.type]) { totalCount++; totalKwh += Engine.calc(DEVICES[it.type], it.config).kwh; } });
    $('#ownCount').textContent = totalCount;
    $('#ownKwh').textContent = totalKwh.toFixed(1);
    $('#ownCost').textContent = (totalKwh * APP_CONFIG.price).toFixed(2);
    const badge = $('#ownBadge');
    if (totalCount > 0) { badge.hidden = false; badge.textContent = totalCount; }
    else { badge.hidden = true; }

    if (detailType) {
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
      $('#ownedBack').style.display = 'none';
      $('#ownedTitle').textContent = '我的设备';
      $('#ownedSub').textContent = '按类型聚类，点击进入查看每台';
      $('#ownedSummary').style.display = '';
      $('#btnClearOwned').textContent = '继续添加';
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
      else if (v === 'view-house') { renderHouse(); }
      showView(v);
    }));
    $('#calcBack').addEventListener('click', () => showView('view-home'));
    $('#resultBack').addEventListener('click', () => showView('view-calc'));
    $('#houseBack').addEventListener('click', () => showView('view-home'));
    $('#btnAdd').addEventListener('click', onAddOrSave);
    $('#ownedBack').addEventListener('click', () => { detailType = null; renderOwned(); });
    $('#btnClearOwned').addEventListener('click', () => {
      if (detailType) { detailType = null; renderOwned(); return; }
      showView('view-home');
    });
  }

  /* ---------- 启动 ---------- */
  migrate();
  renderHome();
  bind();
  showView('view-home');
})();
