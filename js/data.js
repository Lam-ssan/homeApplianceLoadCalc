/* ============================================================
 * 数据层：设备定义 + 系数查表
 * 通用结构：params(数值输入) + factors(下拉系数)
 * 计算引擎只认 key / value，新增设备只需在此追加一段配置
 * ============================================================ */

const APP_CONFIG = {
  price: 0.6,        // 默认电价 元/kWh（可在“我的”调整）
  ringMax: 200,      // 环形图满刻度 kWh（按月）
};

const DEVICES = {
  /* ---------- 电风扇（完整范例） ---------- */
  fan: {
    id: 'fan', name: '电风扇', icon: '🌀', demo: true,
    desc: '夏季常用，单台功率低但使用时间长', ringMax: 120,
    params: [
      { key: 'power', label: '额定功率', unit: 'W', default: 60, min: 1, step: 5 },
      { key: 'hours', label: '每天使用', unit: '小时', default: 8, min: 0, step: 0.5 },
      { key: 'days',  label: '每月使用天数', unit: '天', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty',   label: '数量', unit: '台', default: 1, min: 1, step: 1 },
    ],
    factors: [
      { key: 'gear', label: '风速档位', group: '使用习惯', default: 1.0,
        options: [
          { label: '低速', value: 0.4, tip: '低速档相对高速可省约 60% 电量' },
          { label: '中速', value: 0.7, tip: '中速档相对高速可省约 30% 电量' },
          { label: '高速', value: 1.0 },
        ] },
      { key: 'type', label: '设备类型', group: '设备状况', default: 1.0,
        options: [
          { label: '台扇', value: 1.0 },
          { label: '落地扇', value: 1.0 },
          { label: '吊扇', value: 0.9, tip: '吊扇风效更高，相对更省电' },
          { label: '无叶风扇', value: 1.1, tip: '无叶风扇功率略高' },
        ] },
      { key: 'age', label: '使用年限', group: '设备状况', default: 1.0,
        options: [
          { label: '≤1年（新机）', value: 1.0 },
          { label: '2-3年', value: 1.05 },
          { label: '4-6年', value: 1.1 },
          { label: '7-9年', value: 1.2, tip: '电机老化、效率下降，建议考虑换新' },
          { label: '≥10年', value: 1.3, tip: '效率下降明显，建议更换新机' },
        ] },
      { key: 'temp', label: '环境温度', group: '使用环境', default: 1.0,
        options: [
          { label: '舒适 <28℃', value: 0.8 },
          { label: '28-32℃', value: 1.0 },
          { label: '32-35℃', value: 1.2 },
          { label: '酷热 >35℃', value: 1.4, tip: '高温下使用强度大，建议配合空调降档' },
        ] },
      { key: 'ac', label: '是否配合空调', group: '使用环境', default: 1.0,
        options: [
          { label: '独立使用', value: 1.0 },
          { label: '配合空调', value: 0.7, tip: '配合空调可降低风扇档位与时长，省电约 30%' },
        ] },
    ],
    presets: [30, 45, 60, 70],
  },

  /* ---------- 空调（源自参考 Excel 系数表） ---------- */
  ac: {
    id: 'ac', name: '空调', icon: '❄️',
    desc: '基于 Excel 模型的能效/温度/湿度系数', ringMax: 400,
    params: [
      { key: 'power', label: '输入功率', unit: 'W', default: 1100, min: 1, step: 50 },
      { key: 'hours', label: '每天使用', unit: '小时', default: 8, min: 0, step: 0.5 },
      { key: 'days',  label: '每月使用天数', unit: '天', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty',   label: '数量', unit: '台', default: 1, min: 1, step: 1 },
    ],
    factors: [
      { key: 'inv', label: '变频/定频', group: '能效', default: 0.6,
        options: [
          { label: '变频', value: 0.6, tip: '变频按需求输出，比定频省电' },
          { label: '定频', value: 1.0 },
        ] },
      { key: 'eer', label: '能效等级', group: '能效', default: 1.0,
        options: [
          { label: '新一级(省)', value: 0.85 },
          { label: '二级', value: 0.95 },
          { label: '三级(国标)', value: 1.0 },
          { label: '四级(老旧)', value: 1.1 },
          { label: '五级(很旧)', value: 1.2, tip: '低能效机型耗电高，建议换新' },
        ] },
      { key: 'age', label: '使用年限', group: '设备状况', default: 1.0,
        options: [
          { label: '≤1年', value: 1.0 },
          { label: '2-3年', value: 1.05 },
          { label: '4-6年', value: 1.1 },
          { label: '7-9年', value: 1.2, tip: '冷媒衰减、效率下降，建议检修/换新' },
          { label: '≥10年', value: 1.3, tip: '效率下降明显，建议更换新机' },
        ] },
      { key: 'set', label: '设定温度', group: '使用环境', default: 1.0,
        options: [
          { label: '27℃以上(省)', value: 0.85, tip: '每调高1℃约省 7-10%' },
          { label: '26℃(标准)', value: 1.0 },
          { label: '24-25℃', value: 1.15 },
          { label: '22-23℃', value: 1.3, tip: '温度过低耗电显著增加' },
          { label: '≤21℃', value: 1.5, tip: '耗电约为标准的 1.5 倍' },
        ] },
      { key: 'room', label: '室内温度', group: '使用环境', default: 1.0,
        options: [
          { label: '<30℃', value: 0.6 },
          { label: '30-35℃', value: 1.0 },
          { label: '35-38℃', value: 1.3 },
          { label: '>38℃', value: 1.6, tip: '极端高温压缩机高负荷运行' },
        ] },
      { key: 'hum', label: '室内湿度', group: '使用环境', default: 1.0,
        options: [
          { label: '<50%(干)', value: 0.9 },
          { label: '50-65%', value: 1.0 },
          { label: '65-80%', value: 1.12 },
          { label: '>80%(潮)', value: 1.25, tip: '高湿时除湿负荷增加耗电' },
        ] },
      { key: 'face', label: '楼层朝向', group: '使用环境', default: 1.0,
        options: [
          { label: '中层/无西晒', value: 1.0 },
          { label: '中层西晒', value: 1.2 },
          { label: '顶层', value: 1.25 },
          { label: '顶层西晒', value: 1.4, tip: '得热多，制冷负荷大' },
        ] },
    ],
    presets: [800, 1100, 1500, 2200],
  },

  /* ---------- 冰箱（通用框架扩展） ---------- */
  fridge: {
    id: 'fridge', name: '冰箱', icon: '🧊',
    desc: '24 小时运行，受温控与环境温度影响', ringMax: 60,
    params: [
      { key: 'power', label: '压缩机功率', unit: 'W', default: 120, min: 1, step: 10 },
      { key: 'hours', label: '每日运行', unit: '小时', default: 8, min: 0, max: 24, step: 1 },
      { key: 'days',  label: '每月天数', unit: '天', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty',   label: '数量', unit: '台', default: 1, min: 1, step: 1 },
    ],
    factors: [
      { key: 'gear', label: '温控档位', group: '使用习惯', default: 1.0,
        options: [
          { label: '节能', value: 0.8, tip: '弱冷档可省约 20%' },
          { label: '标准', value: 1.0 },
          { label: '强冷', value: 1.3, tip: '强冷档耗电明显增加' },
        ] },
      { key: 'age', label: '使用年限', group: '设备状况', default: 1.0,
        options: [
          { label: '≤3年', value: 1.0 },
          { label: '4-8年', value: 1.1 },
          { label: '≥9年', value: 1.25, tip: '密封/冷媒老化，建议换新' },
        ] },
      { key: 'temp', label: '环境温度', group: '使用环境', default: 1.0,
        options: [
          { label: '常温', value: 1.0 },
          { label: '高温厨房', value: 1.2, tip: '周围温度高，散热负荷大' },
        ] },
    ],
    presets: [90, 120, 150, 200],
  },

  /* ---------- 洗衣机（通用框架扩展） ---------- */
  washer: {
    id: 'washer', name: '洗衣机', icon: '🧺',
    desc: '与水温、负载频率相关', ringMax: 40,
    params: [
      { key: 'power', label: '额定功率', unit: 'W', default: 500, min: 1, step: 50 },
      { key: 'hours', label: '每次时长', unit: '小时', default: 1, min: 0, step: 0.5 },
      { key: 'days',  label: '每月使用次数', unit: '次', default: 30, min: 0, step: 1 },
      { key: 'qty',   label: '数量', unit: '台', default: 1, min: 1, step: 1 },
    ],
    factors: [
      { key: 'temp', label: '水温', group: '使用习惯', default: 1.0,
        options: [
          { label: '冷水', value: 1.0 },
          { label: '温水', value: 1.2, tip: '加热水温显著增加耗电' },
          { label: '热水', value: 1.5, tip: '热水洗耗电最高' },
        ] },
      { key: 'load', label: '负载', group: '使用习惯', default: 1.0,
        options: [
          { label: '满载', value: 1.0, tip: '集中洗涤、满载更省' },
          { label: '半载', value: 0.85 },
          { label: '少量多洗', value: 1.2, tip: '频繁少量洗效率低' },
        ] },
      { key: 'age', label: '使用年限', group: '设备状况', default: 1.0,
        options: [
          { label: '较新', value: 1.0 },
          { label: '≥8年', value: 1.15 },
        ] },
    ],
    presets: [400, 500, 800, 1000],
  },

  /* ---------- 电视（通用框架扩展） ---------- */
  tv: {
    id: 'tv', name: '电视', icon: '📺',
    desc: '与亮度、观看时长相关', ringMax: 30,
    params: [
      { key: 'power', label: '额定功率', unit: 'W', default: 100, min: 1, step: 10 },
      { key: 'hours', label: '每天观看', unit: '小时', default: 4, min: 0, step: 0.5 },
      { key: 'days',  label: '每月天数', unit: '天', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty',   label: '数量', unit: '台', default: 1, min: 1, step: 1 },
    ],
    factors: [
      { key: 'bri', label: '亮度', group: '使用习惯', default: 1.0,
        options: [
          { label: '节能/暗', value: 0.85 },
          { label: '标准', value: 1.0 },
          { label: '高亮', value: 1.15, tip: '高亮模式耗电更高' },
        ] },
      { key: 'age', label: '使用年限', group: '设备状况', default: 1.0,
        options: [
          { label: '较新', value: 1.0 },
          { label: '老旧机型', value: 1.1, tip: '老式背光效率较低' },
        ] },
    ],
    presets: [60, 100, 150, 200],
  },
};

const DEVICE_ORDER = ['fan', 'ac', 'fridge', 'washer', 'tv'];
