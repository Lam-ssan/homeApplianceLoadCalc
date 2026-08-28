/* ============================================================
 * 计算引擎 v2：按设备模型分派计算
 *
 * 模型（见 data.js 注释）：
 *   constant_power   E = P/1000 × hours×hourMul × days × qty (+ 待机/保温项)
 *   gear_weighted    风扇多档位加权：Σ(档位系数×各档小时) 等效小时 + 待机项
 *   thermal_ac       ΔT 单变量 + 变频负荷随 ΔT 分段 + 围护/湿度/老化
 *   nameplate_daily  E = eDaily × 30 × qty
 *   cycle            E = cycles × (E_wash + dryFreq×dryKWh) × k_load
 *   hot_water        物理公式：水量×温差/效率 + 保温暖损失(随设定温度)
 *   always_on        E = P/1000 × 24 × days × qty
 *
 * 通用规则：
 *   - select 字段 mode:'mul' 直接乘入电量；mode:'hours' 乘入小时；
 *     mode:'custom' 由模型内部消费（不参与通用乘法）
 *   - 省电潜力 bestKwh：冻结 role='climate' 因子，只优化行为/设备项，
 *     不再把「室外 35℃」假设成最省档
 * ============================================================ */

const Engine = {
  /* 取设备默认表单值 */
  defaults(dev) {
    const v = {};
    dev.fields.forEach(f => (v[f.key] = f.default));
    return v;
  },

  /* 计算：返回 { kwh } */
  calc(dev, values) {
    let hourMul = 1;
    dev.fields.forEach(f => {
      if (f.type === 'select' && f.mode === 'hours') hourMul *= Number(values[f.key]) || 1;
    });
    const model = MODEL_FUNCS[dev.model];
    if (!model) return { kwh: 0 };
    let kwh = model(values, hourMul);
    dev.fields.forEach(f => {
      if (f.type === 'select' && (!f.mode || f.mode === 'mul')) kwh *= Number(values[f.key]) || 1;
    });
    if (kwh < 0 || !isFinite(kwh)) kwh = 0;
    return { kwh };
  },

  /* 省电潜力：冻结气候因子（室外温度/湿度/围护等），行为与设备项取推荐值 */
  bestKwh(dev, values) {
    const v = Object.assign({}, values);
    Object.assign(v, dev.best || {});
    dev.fields.forEach(f => {
      if (f.type !== 'select' || f.role === 'climate' || f.noBest) return;
      v[f.key] = Math.min.apply(null, f.options.map(o => o.value));
    });
    return Engine.calc(dev, v).kwh;
  },

  /* 规则式诊断建议 */
  diagnose(dev, values) {
    const tips = [];
    const push = (level, icon, title, text) => tips.push({ level, icon, title, text });
    const num = k => Number(values[k]) || 0;
    const selVal = key => Number(values[key]);
    const findOpt = (key, val) => {
      const f = dev.fields.find(x => x.key === key);
      return f ? f.options.find(o => o.value === val) : null;
    };

    /* ---- 通用：高耗选项提示 ---- */
    dev.fields.forEach(f => {
      if (f.type !== 'select') return;
      if (f.mode === 'custom' || f.mode === 'hours') return;
      if (num(f.key) <= 1.0001) return;
      const opt = findOpt(f.key, num(f.key));
      if (opt && opt.tip) {
        push(num(f.key) >= 1.15 ? 'warn' : 'info', '💡', f.label + '：' + opt.label, opt.tip);
      }
    });

    /* ---- 分模型规则 ---- */
    const cur = Engine.calc(dev, values).kwh;

    if (dev.model === 'thermal_ac') {
      const st = num('setTemp');
      if (st > 0 && st < 26) {
        const better = Engine.calc(dev, Object.assign({}, values, { setTemp: 26 })).kwh;
        const save = cur - better;
        push('danger', '🌡', '设定温度偏低（' + st + '℃）',
          '调到 26℃ 这台每月约省 ' + save.toFixed(1) + ' kWh（约 ' + (save * getPrice()).toFixed(1) + ' 元）。配合风扇体感相近。');
      }
      if (selVal('filter') > 1) {
        push('info', '🧰', '滤网较脏', '清洗滤网可恢复风量，本项约 ' +
          ((cur - cur / num('filter')).toFixed(1)) + ' kWh/月。');
      }
      if (selVal('modeInv') === 0 && selVal('age') >= 1.16) {
        push('warn', '🔁', '定频且机龄较长', '换一级变频的回收期通常 2-4 年（按夏季月省电估算），可结合以旧换新补贴考虑。');
      }
      if (num('tout') >= 35 && selVal('envelope') >= 1.25) {
        push('info', '🏠', '高温+顶楼/西晒', '遮阳帘、隔热膜能降低围护得热，这是短期不可改的环境因素中少数可干预的一项。');
      }
    }

    if (dev.model === 'hot_water') {
      const st = num('setTemp');
      if (st >= 65) {
        const better = Engine.calc(dev, Object.assign({}, values, { setTemp: 55 })).kwh;
        const save = cur - better;
        push('danger', '🌡', '设定温度过高（' + st + '℃）',
          '淋浴混水到 40℃ 用不完这么多高温水，白白增加保温暖损失。降到 55℃ 每月约省 ' + save.toFixed(1) + ' kWh。');
      }
      if (num('tin') <= 20) {
        push('info', '❄️', '冬季进水温度低', '进水越冷加热耗电越多，冬季热水电费约为夏季的 1.5-2 倍，属正常现象。');
      }
    }

    if (dev.model === 'nameplate_daily') {
      if (selVal('place') >= 1.25) {
        push('warn', '🏠', '放置在高温位置', '冰箱散热不良耗电明显上升，有条件移到阴凉通风处，两侧留出散热空隙。');
      }
      if (selVal('age') >= 1.25) {
        push('warn', '♻️', '机龄超过10年', '一级能效新冰箱日耗可低一半以上，年省电费可观，值得列入换新计划。');
      }
    }

    if (dev.model === 'cycle') {
      if (selVal('program') >= 0.9) {
        const better = Engine.calc(dev, Object.assign({}, values, { program: 0.45 })).kwh;
        push('warn', '🌡', '常用程序水温较高', '改用 40℃ 或常温程序，每月约省 ' + (cur - better).toFixed(1) + ' kWh（加热水占滚筒耗电大头）。');
      }
      if (selVal('dryFreq') >= 0.5) {
        const better = Engine.calc(dev, Object.assign({}, values, { dryFreq: 0 })).kwh;
        push('warn', '☀️', '烘干使用频繁', '广东日照充足，能晾晒就不烘干，每月约省 ' + (cur - better).toFixed(1) + ' kWh。');
      }
    }

    if (dev.model === 'gear_weighted') {
      const hH = num('hHigh');
      const total = num('hLow') + num('hMid') + hH;
      if (total > 0 && hH / total > 0.5) {
        push('info', '🌀', '高速档使用占比过高', '多数场景中低速档已够用，风感更柔和，功耗也明显更低。');
      }
      if (num('standby') >= 2) {
        push('info', '🔌', '待机功率偏高', '不用时断开电源或选带机械开关的插座，长期待机每月也有零点几度。');
      }
    }

    if (dev.id === 'ricecooker' && num('warmHours') >= 4) {
      const better = Engine.calc(dev, Object.assign({}, values, { warmHours: 1 })).kwh;
      push('warn', '🍚', '保温时间较长', '保温功率虽小但持续时间长，饭后及时拔电源/转移饭盒，每月约省 ' +
        (cur - better).toFixed(1) + ' kWh。');
    }

    if (dev.model === 'constant_power' && dev.id === 'lighting') {
      if (num('power') >= 25) {
        const better = Engine.calc(dev, Object.assign({}, values, { power: 12 })).kwh;
        push('warn', '💡', '仍有非 LED 光源', '全部换成 LED 后照明电量可降到 1/3 左右，每月约省 ' + (cur - better).toFixed(1) + ' kWh。');
      }
    }

    if (dev.model === 'always_on' && num('power') >= 20) {
      push('info', '🔌', '常开功率偏大', '检查机顶盒、旧路由等是否可随手断电；仅路由+光猫一般 10W 出头即可。');
    }

    /* 兜底 */
    if (tips.length === 0) {
      push('info', '✅', '当前设置较优', '各选项均处于基准或更优水平，暂无明显改进空间。');
    }
    return tips;
  },
};

/* ---------- 各模型的电量计算函数（不含 mode:'mul' 的通用因子） ---------- */
const MODEL_FUNCS = {
  /* 恒功率：可选待机（standby，作用于剩余时段）与保温（warmPower+warmHours） */
  constant_power(v, hm) {
    const hours = Number(v.hours) || 0;
    const warmH = Math.min(Number(v.warmHours) || 0, Math.max(24 - hours, 0));
    const rest = Math.max(24 - hours - warmH, 0);
    const e = (Number(v.power) / 1000) * hours * hm
      + (Number(v.warmPower) || 0) / 1000 * warmH
      + (Number(v.standby) || 0) / 1000 * rest;
    return e * (Number(v.days) || 0) * (Number(v.qty) || 1);
  },

  /* 风扇多档位加权：额定功率为高速档基准，按各档时长加权 */
  gear_weighted(v, hm) {
    const hL = Number(v.hLow) || 0, hM = Number(v.hMid) || 0, hH = Number(v.hHigh) || 0;
    const effHours = hL * 0.45 + hM * 0.7 + hH * 1.0; // 档位功率比取自实测参考
    const rest = Math.max(24 - (hL + hM + hH), 0);
    const e = (Number(v.power) / 1000) * effHours * hm
      + (Number(v.standby) || 0) / 1000 * rest;
    return e * (Number(v.days) || 0) * (Number(v.qty) || 1);
  },

  /* 常开低功率 */
  always_on(v) {
    return (Number(v.power) / 1000) * 24 * (Number(v.days) || 30) * (Number(v.qty) || 1);
  },

  /* 铭牌日耗电（冰箱） */
  nameplate_daily(v) {
    return (Number(v.eDaily) || 0) * 30 * (Number(v.qty) || 1);
  },

  /* 热力空调：ΔT 合并 + 变频随 ΔT */
  thermal_ac(v, hm) {
    const P = Number(v.power) || 0;
    const hours = (Number(v.hours) || 0) * hm;
    const dT = Math.max((Number(v.tout) || 0) - (Number(v.setTemp) || 0), 0);

    let kInv;
    if (Number(v.modeInv)) {
      kInv = dT <= 4 ? 0.50 : dT <= 8 ? 0.60 : dT <= 12 ? 0.75 : 0.88;
    } else {
      kInv = 1.0; // 定频不再乘 0.6
    }

    let kDT = dT >= 9 ? Math.pow(1.08, dT - 9) : Math.pow(0.92, 9 - dT);
    kDT = Math.min(Math.max(kDT, 0.55), 1.80);

    return (P / 1000) * hours * kInv * kDT * (Number(v.days) || 0) * (Number(v.qty) || 1);
  },

  /* 循环批次（洗衣机） */
  cycle(v) {
    const cycles = Number(v.cycles) || 0;
    const wash = Number(v.program) || 0;
    const dry = (Number(v.dryFreq) || 0) * (Number(v.dryType) || 0);
    return cycles * (wash + dry);
  },

  /* 储水电热水器（物理公式） */
  hot_water(v) {
    const showers = Number(v.showers) || 0;
    const showerL = Number(v.showerL) || 40;
    const otherL = Number(v.otherL) || 0;
    const tin = Number(v.tin) || 20;
    const setTemp = Number(v.setTemp) || 55;
    const volume = Number(v.volume) || 60;

    // 混水到 40℃ 的日用水量 → 加热耗电（电阻效率 0.95）
    const V40 = showers * showerL + otherL;
    const dTw = Math.max(40 - tin, 0);
    const eHeatDay = 0.001163 * V40 * dTw / 0.95;

    // 24h 固有热损失（GB 21519 口径粗值），随设定温度缩放（相对 55℃，环温约25℃）
    const q24 = Math.min(Math.max(0.70 + (volume - 40) * 0.0075, 0.4), 2.5);
    const kSet = Math.min(Math.max((setTemp - 25) / 30, 0.5), 2.0);
    const eLossDay = q24 * kSet;

    return (eHeatDay + eLossDay) * 30;
  },
};
