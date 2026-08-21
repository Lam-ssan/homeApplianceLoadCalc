/* ============================================================
 * 计算引擎：数据驱动，通用计算 + 诊断
 * 通用公式（按月）：
 *   月用电量(kWh) = 功率(W)/1000 × 每天小时 × 每月天数 × 数量
 *                  × Π(各因子系数)
 *   月电费(元)   = 月用电量 × 电价
 * ============================================================ */

const Engine = {
  // 取设备默认表单值
  defaults(dev) {
    const v = {};
    dev.params.forEach(p => (v[p.key] = p.default));
    dev.factors.forEach(f => (v[f.key] = f.default));
    return v;
  },

  // 计算（返回 kWh 与 电费）
  calc(dev, values, price) {
    const power = Number(values.power) || 0;
    const hours = Number(values.hours) || 0;
    const days  = Number(values.days) || 0;
    const qty   = Number(values.qty) || 1;
    let k = (power / 1000) * hours * days * qty;
    dev.factors.forEach(f => (k *= Number(values[f.key]) || 1));
    const cost = k * (price != null ? price : APP_CONFIG.price);
    return { kwh: k, cost };
  },

  // 最佳情景用电量（每个因子取最小值），用于估算省电潜力
  bestKwh(dev, values) {
    const power = Number(values.power) || 0;
    const hours = Number(values.hours) || 0;
    const days  = Number(values.days) || 0;
    const qty   = Number(values.qty) || 1;
    let k = (power / 1000) * hours * days * qty;
    dev.factors.forEach(f => {
      const min = Math.min.apply(null, f.options.map(o => o.value));
      k *= min;
    });
    return k;
  },

  // 生成诊断建议（因子选项自带的 tip）
  diagnose(dev, values) {
    const tips = [];
    dev.factors.forEach(f => {
      const sel = f.options.find(o => o.value === Number(values[f.key]));
      if (sel && sel.tip) {
        const level = sel.value >= 1.15 ? 'danger' : sel.value > 1.0 ? 'warn' : 'info';
        tips.push({
          level,
          icon: sel.value > 1.0 ? '⚠️' : '💡',
          title: f.label + '：' + sel.label,
          text: sel.tip,
        });
      }
    });
    if (tips.length === 0) {
      tips.push({ level: 'info', icon: '✅', title: '当前设置较优', text: '各系数均处于基准或更低，用电较为合理。' });
    }
    return tips;
  },
};
