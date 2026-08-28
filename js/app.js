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

  /* 已保存设备的月用电总量 */
  function sumInstancesKwh() {
    return loadInst().reduce((s, it) =>
      s + (DEVICES[it.type] ? Engine.calc(DEVICES[it.type], it.config).kwh : 0), 0);
  }

  const VIEW_META = {
    'view-home': ['家庭用电智能诊断器', '选择家电，测算月用电'],
    'view-calc': ['用电测算', '填写参数，实时估算'],
    'view-result': ['节能诊断', '基于模型的用电分析'],
    'view-owned': ['我的设备', '按类型查看，点进去可编辑'],
    'view-house': ['全屋诊断', '汇总所有已添加设备'],
  };

  function syncChrome(id) {
    const isSub = id === 'view-calc' || id === 'view-result';
    $('#app').classList.toggle('is-subpage', isSub);
    const needBack = isSub || (id === 'view-owned' && !!detailType);
    $('#appBack').hidden = !needBack;
  }

  /* ---------- 视图切换 ---------- */
  function showView(id) {
    $$('.view').forEach(v => v.classList.remove('view--active'));
    $('#' + id).classList.add('view--active');
    if (VIEW_META[id]) {
      $('#appTitle').textContent = VIEW_META[id][0];
      $('#appSub').textContent = VIEW_META[id][1];
    }
    $$('.tab').forEach(t => t.classList.toggle('tab--active', t.dataset.view === id));
    syncChrome(id);
    window.scrollTo(0, 0);
  }

  /* ---------- 设备选择首页 ---------- */
  function renderHome() {
    const arr = loadInst();
    const stats = $('#homeStats');
    let kwh = 0;
    arr.forEach(it => {
      if (DEVICES[it.type]) kwh += Engine.calc(DEVICES[it.type], it.config).kwh;
    });
    const cost = tariffCost(kwh);
    stats.hidden = false;
    stats.innerHTML = `
      <div class="home-stats__nums">
        <div><b>${arr.length}</b><span>台设备</span></div>
        <div><b>${kwh.toFixed(0)}</b><span>kWh/月</span></div>
        <div><b>${cost == null ? '—' : cost.toFixed(2)}</b><span>元/月</span></div>
      </div>
      <div class="home-stats__go">
        <button type="button" class="home-stats__btn">设置电价</button>
        <span class="home-stats__label">${tariffLabel().split('·').map(s => '<span class="tl-seg">' + s + '</span>').join('·')}</span>
      </div>`;

    const counts = {};
    arr.forEach(it => { counts[it.type] = (counts[it.type] || 0) + 1; });

    const host = $('#deviceCats');
    host.innerHTML = '';
    DEVICE_CATS.forEach(cat => {
      const sec = document.createElement('section');
      sec.className = 'cat';
      const h = document.createElement('h2');
      h.className = 'section-title';
      h.textContent = cat.name;
      const grid = document.createElement('div');
      grid.className = 'device-grid';
      cat.ids.forEach(id => {
        const d = DEVICES[id];
        if (!d) return;
        const n = counts[id] || 0;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'device' + (n ? ' device--added' : '');
        el.innerHTML = `<div class="device__icon">${d.icon}</div>
          <div class="device__name">${d.name}</div>
          ${n ? `<div class="device__tag device__tag--on">已有 ${n} 台</div>` : ''}`;
        el.addEventListener('click', () => openDevice(id));
        grid.appendChild(el);
      });
      sec.appendChild(h);
      sec.appendChild(grid);
      host.appendChild(sec);
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
      presets.style.display = '';
    } else {
      presets.style.display = 'none';
    }

    renderForm(dev);
    live();
    showView('view-calc');
    $('#appTitle').textContent = dev.name;
    $('#appSub').textContent = iid ? '修改参数并保存' : '填写参数，实时估算';
  }

  /* ---------- 渲染表单（按 group 分卡片） ---------- */
  function renderForm(dev) {
    const form = $('#calcForm');
    form.innerHTML = '';

    const GROUP_TITLES = {
      usage: '使用情况',
      identity: '设备信息',
      behavior: '使用习惯（可优化）',
      env: '环境与建筑（短期难改）',
    };

    const order = [];
    const groups = {};
    dev.fields.forEach(f => {
      if (!groups[f.group]) { groups[f.group] = []; order.push(f.group); }
      groups[f.group].push(f);
    });

    order.forEach(g => {
      const fold = g === 'env';
      const c = fold ? document.createElement('details') : document.createElement('div');
      c.className = fold ? 'card card--fold' : 'card';
      if (fold) {
        const h = document.createElement('summary');
        h.className = 'card__title';
        h.textContent = GROUP_TITLES[g] || g;
        c.appendChild(h);
      } else {
        const h = document.createElement('div');
        h.className = 'card__title';
        h.textContent = GROUP_TITLES[g] || g;
        c.appendChild(h);
      }
      groups[g].forEach(f => c.appendChild(f.type === 'number' ? numField(f) : selectField(f)));
      form.appendChild(c);
    });
  }

  function numField(f) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.innerHTML = `<label class="field__label" for="f_${f.key}">${f.label}</label>
      <div class="field__row">
        <input class="input" id="f_${f.key}" type="number" inputmode="decimal" value="${values[f.key] != null ? values[f.key] : f.default}"
          min="${f.min != null ? f.min : ''}" max="${f.max != null ? f.max : ''}" step="${f.step || 1}" />
        ${f.unit ? `<span class="field__suffix">${f.unit}</span>` : ''}
      </div>
      ${f.tip ? `<p class="field__tip">${f.tip}</p>` : ''}`;
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
      `<option value="${o.value}" ${o.value === cur ? 'selected' : ''}${o.tip ? ` title="${o.tip}"` : ''}>${o.label}</option>`).join('');
    wrap.innerHTML = `<label class="field__label" for="f_${f.key}">${f.label}</label>
      <select class="select" id="f_${f.key}">${opts}</select>
      ${f.tip ? `<p class="field__tip">${f.tip}</p>` : ''}`;
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
    const total = sumInstancesKwh() + kwh;
    const cost = kwh * avgPrice(total);
    $('#rKwh').textContent = kwh.toFixed(2);
    $('#rCost').textContent = cost.toFixed(2);
  }

  /* ---------- 单台设备诊断 ---------- */
  function diagnose() {
    if (!currentId) return;
    const dev = DEVICES[currentId];
    const { kwh } = Engine.calc(dev, values);
    const best = Engine.bestKwh(dev, values);
    const savingKwh = Math.max(0, kwh - best);
    const total = sumInstancesKwh() + kwh;
    const unit = avgPrice(total);
    const savingCost = savingKwh * unit;

    const ringMax = dev.ringMax || APP_CONFIG.ringMax;
    const pct = Math.min(kwh / ringMax, 1);
    const C = 2 * Math.PI * 52;
    $('#ringFg').style.strokeDashoffset = (C * (1 - pct)).toFixed(1);

    $('#ringKwh').textContent = kwh.toFixed(1);
    $('#resDevice').textContent = dev.name;
    $('#resCost').textContent = (kwh * unit).toFixed(2) + ' 元';
    $('#resSaving').textContent = savingCost.toFixed(1) + ' 元';

    const tips = Engine.diagnose(dev, values);
    const box = $('#tips');
    box.innerHTML = '';
    tips.forEach(t => box.appendChild(tipEl(t)));

    if (currentIid) {
      const arr = loadInst();
      const inst = arr.find(x => x.iid === currentIid);
      if (inst) { inst.config = Object.assign({}, values); saveInst(arr); }
      $('#btnAddFromResult').hidden = true;
    } else {
      $('#btnAddFromResult').hidden = false;
      $('#btnAddFromResult').textContent = '加入我的设备';
    }
    showView('view-result');
    $('#appTitle').textContent = dev.name + ' · 诊断';
  }

  /* ---------- 全屋诊断（诊断 Tab） ---------- */
  function renderHouse() {
    const arr = loadInst();
    const summary = $('#houseSummary');
    const rankBox = $('#houseRank');
    const tipBox = $('#houseTips');
    $('#view-house').classList.toggle('is-empty', arr.length === 0);

    if (arr.length === 0) {
      summary.style.display = 'none';
      rankBox.innerHTML = `<div class="empty">
        <div class="empty__art">🏠</div>
        <b>还没有设备</b>
        <p>先添加家电，再看全屋用电分析</p>
        <button type="button" class="btn-primary" id="btnEmptyToHome">去添加设备</button>
      </div>`;
      tipBox.innerHTML = '';
      const go = $('#btnEmptyToHome');
      if (go) go.addEventListener('click', () => { renderHome(); showView('view-home'); });
      return;
    }

    const rows = [];
    let totalKwh = 0, totalSave = 0;
    arr.forEach(it => {
      const dev = DEVICES[it.type];
      if (!dev) return;
      const { kwh } = Engine.calc(dev, it.config);
      const best = Engine.bestKwh(dev, it.config);
      const save = Math.max(0, kwh - best);
      totalKwh += kwh; totalSave += save;
      rows.push({ dev, kwh, save, config: it.config });
    });

    summary.style.display = '';
    const hsCost = tariffCost(totalKwh);
    $('#hsCount').textContent = String(rows.length);
    $('#hsKwh').textContent = totalKwh.toFixed(1);
    $('#hsCost').textContent = hsCost == null ? '—' : hsCost.toFixed(2);
    const hsSave = hsCost == null ? 0 : Math.max(0, hsCost - (tariffCost(totalKwh - totalSave) || 0));
    $('#hsSave').textContent = hsSave.toFixed(1);

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
        ${r.save > 0.05 ? `<div class="rank-save">省电潜力约 ${(r.save * avgPrice(totalKwh)).toFixed(1)} 元/月</div>` : ''}`;
      rankBox.appendChild(el);
    });

    const all = [];
    rows.forEach(r => {
      const tips = Engine.diagnose(r.dev, r.config)
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
    renderHome();
    showView('view-owned');
  }

  /* ---------- 自定义确认弹窗 ---------- */
  function appConfirm(msg, okText) {
    return new Promise(resolve => {
      const modal = $('#confirmModal');
      $('#confirmText').textContent = msg;
      $('#confirmOk').textContent = okText || '确定';
      modal.hidden = false;
      const done = val => {
        modal.hidden = true;
        $('#confirmOk').removeEventListener('click', onOk);
        $('#confirmCancel').removeEventListener('click', onCancel);
        $('.modal__mask', modal).removeEventListener('click', onCancel);
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      $('#confirmOk').addEventListener('click', onOk);
      $('#confirmCancel').addEventListener('click', onCancel);
      $('.modal__mask', modal).addEventListener('click', onCancel);
    });
  }

  async function removeInstance(iid) {
    if (!(await appConfirm('确定删除这台设备？', '删除'))) return;
    saveInst(loadInst().filter(x => x.iid !== iid));
    if (detailType && !loadInst().some(x => x.type === detailType)) detailType = null;
    renderOwned();
    renderHome();
  }

  function renderOwned() {
    const arr = loadInst();
    const box = $('#ownedList');
    box.innerHTML = '';

    let totalKwh = 0, totalCount = 0;
    arr.forEach(it => { if (DEVICES[it.type]) { totalCount++; totalKwh += Engine.calc(DEVICES[it.type], it.config).kwh; } });
    $('#ownCount').textContent = totalCount;
    const ownCost = tariffCost(totalKwh);
    $('#ownKwh').textContent = totalKwh.toFixed(1);
    $('#ownCost').textContent = ownCost == null ? '—' : ownCost.toFixed(2);
    const badge = $('#ownBadge');
    if (totalCount > 0) { badge.hidden = false; badge.textContent = totalCount; }
    else { badge.hidden = true; }

    if (detailType) {
      $('#ownedSummary').style.display = 'none';
      $('#btnClearOwned').style.display = 'none';
      $('#appTitle').textContent = DEVICES[detailType].name;
      $('#appSub').textContent = '每台可独立编辑或删除';
      $('#ownedSub').textContent = '点击条目可修改参数';
      $('#appBack').hidden = false;
      const list = arr.filter(x => x.type === detailType);
      if (list.length === 0) {
        box.innerHTML = '<div class="empty"><div class="empty__art">📭</div><b>该类型暂无设备</b></div>';
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
      $('#ownedSummary').style.display = '';
      $('#btnClearOwned').style.display = '';
      $('#btnClearOwned').textContent = '继续添加设备';
      $('#appTitle').textContent = '我的设备';
      $('#appSub').textContent = '按类型查看，点进去可编辑';
      $('#ownedSub').textContent = '按类型查看，点进去可编辑每台';
      $('#appBack').hidden = true;
      const groups = {};
      arr.forEach(it => { if (DEVICES[it.type]) (groups[it.type] = groups[it.type] || []).push(it); });
      const ids = Object.keys(groups);
      if (ids.length === 0) {
        box.innerHTML = `<div class="empty">
          <div class="empty__art">📦</div>
          <b>还没有添加设备</b>
          <p>去「设备」选择家电，测算后再加进来</p>
          <button type="button" class="btn-primary" id="btnEmptyOwned">去添加设备</button>
        </div>`;
        $('#btnClearOwned').style.display = 'none';
        const go = $('#btnEmptyOwned');
        if (go) go.addEventListener('click', () => { renderHome(); showView('view-home'); });
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

  function enterApp() {
    sessionStorage.setItem('hldc_entered', '1');
    const splash = $('#splash');
    splash.classList.add('splash--out');
    setTimeout(() => {
      document.documentElement.classList.add('entered');
      splash.hidden = true;
    }, 360);
  }

  /* ---------- 事件绑定 ---------- */
  /* ---------- 价格刷新：保存电价后重算所有费用展示 ---------- */
  function refreshPrices() {
    renderHome();
    renderOwned();
    const active = $('.view--active') ? $('.view--active').id : '';
    if (active === 'view-house') renderHouse();
    if (active === 'view-calc' || active === 'view-result') live();
    if (active === 'view-result') diagnose();
  }

  function bind() {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      const v = t.dataset.view;
      if (v === 'view-owned') { detailType = null; renderOwned(); }
      else if (v === 'view-house') { renderHouse(); }
      else if (v === 'view-home') { renderHome(); }
      showView(v);
    }));
    $('#appBack').addEventListener('click', () => {
      const active = $('.view--active').id;
      if (active === 'view-calc') { renderHome(); showView('view-home'); }
      else if (active === 'view-result') {
        showView('view-calc');
        if (currentId && DEVICES[currentId]) {
          $('#appTitle').textContent = DEVICES[currentId].name;
          $('#appSub').textContent = currentIid ? '修改参数并保存' : '填写参数，实时估算';
        }
      }
      else if (active === 'view-owned' && detailType) { detailType = null; renderOwned(); }
    });
    $('#btnAdd').addEventListener('click', onAddOrSave);
    $('#btnDiagnose').addEventListener('click', diagnose);
    $('#btnAddFromResult').addEventListener('click', onAddOrSave);
    $('#btnClearOwned').addEventListener('click', () => {
      if (detailType) { detailType = null; renderOwned(); return; }
      renderHome();
      showView('view-home');
    });
    $('#btnEnter').addEventListener('click', enterApp);

    /* ---------- 电价设置弹窗（阶梯/合表/商业） ---------- */
    const priceModal = $('#priceModal');
    let draftTariff = null;

    function regionRowsHtml(type) {
      return TARIFF_REGIONS.map(rk => {
        const t = TARIFFS[rk];
        let price;
        if (type === 'combined') price = '¥' + t.combined.toFixed(3) + '/度';
        else price = '一档¥' + t.ladder.summer[0].price.toFixed(3) +
          ' · 二档¥' + t.ladder.summer[1].price.toFixed(3) +
          ' · 三档¥' + t.ladder.summer[2].price.toFixed(3);
        return `<button type="button" class="region" data-region="${rk}">
                  <span class="region__name">${t.name}</span>
                  <span class="region__price">${price}</span>
                </button>`;
      }).join('');
    }

    function buildTariffModal() {
      $('#regionListLadder').innerHTML = regionRowsHtml('ladder');
      $('#regionListCombined').innerHTML = regionRowsHtml('combined');
    }

    function capPanel(type) { return 'regionList' + type.charAt(0).toUpperCase() + type.slice(1); }

    function syncTariffModal() {
      $$('.tariff-tab').forEach(b => b.classList.toggle('is-active', b.dataset.type === draftTariff.type));
      $$('.tariff-panel').forEach(p => { p.hidden = p.dataset.panel !== draftTariff.type; });
      $$('.seg__btn').forEach(b => b.classList.toggle('is-active', b.dataset.season === draftTariff.season));
      ['ladder', 'combined', 'business'].forEach(type => {
        $$('#' + capPanel(type) + ' .region').forEach(el => {
          el.classList.toggle('is-active', el.dataset.region === draftTariff.region);
        });
      });
    }

    function openTariffModal() {
      draftTariff = getTariffCfg();
      syncTariffModal();
      priceModal.hidden = false;
    }

    buildTariffModal();

    $$('.tariff-tab').forEach(b => b.addEventListener('click', () => {
      draftTariff.type = b.dataset.type;
      syncTariffModal();
    }));
    $$('.seg__btn').forEach(b => b.addEventListener('click', () => {
      draftTariff.season = b.dataset.season;
      syncTariffModal();
    }));
    ['ladder', 'combined', 'business'].forEach(type => {
      const list = $('#' + capPanel(type));
      if (list) list.addEventListener('click', e => {
        const btn = e.target.closest('.region');
        if (!btn) return;
        draftTariff.region = btn.dataset.region;
        syncTariffModal();
      });
    });

    $('#priceCancel').addEventListener('click', () => { priceModal.hidden = true; });
    priceModal.querySelector('.modal__mask').addEventListener('click', () => { priceModal.hidden = true; });
    $('#priceSave').addEventListener('click', () => {
      try { localStorage.setItem('hldc_tariff', JSON.stringify(draftTariff)); } catch (e) {}
      priceModal.hidden = true;
      refreshPrices();
      toast('电价已更新：' + tariffLabel(draftTariff));
    });

    $('#homeStats').addEventListener('click', e => {
      if (e.target.closest('.home-stats__btn')) openTariffModal();
    });
  }

  /* ---------- 启动 ---------- */
  migrate();
  renderHome();
  renderOwned();
  bind();
  showView('view-home');
  if (document.documentElement.classList.contains('entered')) {
    const splash = $('#splash');
    if (splash) splash.hidden = true;
  }
})();
