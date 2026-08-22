/* ============================================================
 * 数据层：设备定义 + 系数查表（v2 按计算模型分派）
 *
 * 每个设备必须声明 model，引擎按模型分支计算，禁止所有电器
 * 共用一套「功率×小时×Π系数」：
 *   constant_power   恒功率：风扇、电视、照明、常开设备
 *   thermal_ac       热力空调：ΔT 单变量 + 变频随 ΔT
 *   nameplate_daily  铭牌日耗电：冰箱（能效标识 kWh/24h）
 *   cycle            循环批次：洗衣机（次数 × 单次电耗）
 *   hot_water        热水：物理公式（水量 × 温差 / 效率 + 保温暖损失）
 *
 * 字段分组 group 决定 UI 卡片：
 *   usage 使用情况 / identity 设备信息 / behavior 行为习惯 / env 环境
 * select 项 role 标注可优化性：
 *   behavior 行为（潜力计算可优化）/ device 设备属性（可优化）/
 *   climate 气候环境（短期不可改，潜力计算冻结）
 * ============================================================ */

const APP_CONFIG = {
  price: 0.6,        // 电价 元/kWh
  ringMax: 200,      // 环形图满刻度 kWh（按月）
};

const DEVICES = {
  /* ---------- 电风扇（恒功率范例） ---------- */
  fan: {
    id: 'fan', name: '电风扇', icon: '🌀', model: 'constant_power',
    desc: '高温主要延长使用时长，而不是放大功率', ringMax: 120,
    fields: [
      { key: 'power', label: '额定功率', unit: 'W', type: 'number', group: 'usage', default: 60, min: 1, step: 5 },
      { key: 'hours', label: '每天使用', unit: '小时', type: 'number', group: 'usage', default: 8, min: 0, max: 24, step: 0.5 },
      { key: 'days', label: '每月使用天数', unit: '天', type: 'number', group: 'usage', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty', label: '数量', unit: '台', type: 'number', group: 'usage', default: 1, min: 1, step: 1 },
      { key: 'gear', label: '风速档位', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '低速（省约60%）', value: 0.4 },
          { label: '中速（省约30%）', value: 0.7 },
          { label: '高速', value: 1.0 },
        ] },
      { key: 'type', label: '类型', type: 'select', group: 'identity', role: 'device', default: 1.0,
        options: [
          { label: '台扇', value: 1.0 },
          { label: '落地扇', value: 1.0 },
          { label: '直流变频扇（约30W）', value: 0.55 },
          { label: '吊扇', value: 0.9 },
          { label: '无叶风扇', value: 1.1 },
        ] },
      { key: 'age', label: '使用年限', type: 'select', group: 'identity', role: 'device', default: 1.0,
        options: [
          { label: '≤1年（新机）', value: 1.0 },
          { label: '2-3年', value: 1.05 },
          { label: '4-6年', value: 1.1 },
          { label: '≥7年', value: 1.15 },
        ] },
      { key: 'acmix', label: '是否配合空调', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '独立使用', value: 1.0 },
          { label: '配合空调使用', value: 0.7, tip: '同房间有空调时档位与时长都会降低' },
        ] },
      { key: 'temp', label: '环境温度（影响时长）', type: 'select', group: 'env', role: 'climate', mode: 'hours',
        default: 1.0,
        options: [
          { label: '舒适 <28℃', value: 0.85 },
          { label: '28-32℃', value: 1.0 },
          { label: '32-35℃', value: 1.15 },
          { label: '酷热 >35℃', value: 1.3 },
        ] },
    ],
    presets: { key: 'power', items: [30, 45, 60, 75], unit: 'W' },
  },

  /* ---------- 分体空调（热力模型：ΔT 合并） ---------- */
  ac: {
    id: 'ac', name: '空调', icon: '❄️', model: 'thermal_ac',
    desc: '设定温度与室外温度合并为温差 ΔT，不再双乘', ringMax: 500,
    fields: [
      { key: 'power', label: '额定输入功率', unit: 'W', type: 'number', group: 'identity', default: 920, min: 100, step: 10 },
      { key: 'modeInv', label: '变频/定频', type: 'select', group: 'identity', role: 'device', mode: 'custom',
        noBest: true, default: 1,
        options: [
          { label: '定频', value: 0 },
          { label: '变频（负荷随ΔT变化）', value: 1 },
        ] },
      { key: 'age', label: '使用年限', type: 'select', group: 'identity', role: 'device', default: 1.0,
        options: [
          { label: '≤3年', value: 1.0 },
          { label: '4-6年', value: 1.08 },
          { label: '7-9年', value: 1.16 },
          { label: '≥10年', value: 1.25 },
        ] },
      { key: 'hours', label: '每天开机时间', unit: '小时', type: 'number', group: 'usage', default: 8, min: 0, max: 24, step: 0.5 },
      { key: 'days', label: '本月使用天数', unit: '天', type: 'number', group: 'usage', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty', label: '台数', unit: '台', type: 'number', group: 'usage', default: 1, min: 1, step: 1 },
      { key: 'setTemp', label: '设定温度', unit: '℃', type: 'number', group: 'behavior', default: 26, min: 16, max: 30, step: 0.5 },
      { key: 'fanMix', label: '是否配风扇', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '不配风扇', value: 1.0 },
          { label: '配合风扇', value: 0.9, tip: '风扇辅助可提高设定温度' },
        ] },
      { key: 'filter', label: '滤网状态', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '清洁', value: 1.0 },
          { label: '较脏', value: 1.1, tip: '脏滤网增加风阻与能耗，建议清洗' },
        ] },
      { key: 'tout', label: '本月典型室外温度', unit: '℃', type: 'number', group: 'env', role: 'climate',
        default: 33, min: 20, max: 42, step: 1 },
      { key: 'rh', label: '湿度', type: 'select', group: 'env', role: 'climate', default: 1.0,
        options: [
          { label: '<50%（干）', value: 0.92 },
          { label: '50-65%', value: 1.0 },
          { label: '65-80%', value: 1.10 },
          { label: '>80%（潮）', value: 1.22 },
        ] },
      { key: 'envelope', label: '楼层/朝向（围护负荷）', type: 'select', group: 'env', role: 'climate', default: 1.0,
        options: [
          { label: '中间层·不西晒', value: 1.0 },
          { label: '中间层·西晒', value: 1.2 },
          { label: '顶层', value: 1.25 },
          { label: '顶层·西晒', value: 1.4 },
        ] },
    ],
    presets: {
      key: 'power',
      items: [
        { label: '1匹·660W', value: 660 },
        { label: '1.5匹·920W', value: 920 },
        { label: '2匹·1320W', value: 1320 },
        { label: '3匹·1900W', value: 1900 },
      ], unit: '',
    },
    best: { setTemp: 26 },
  },

  /* ---------- 冰箱（铭牌日耗电模型） ---------- */
  fridge: {
    id: 'fridge', name: '冰箱', icon: '🧊', model: 'nameplate_daily',
    desc: '主输入为能效标识日耗电，不再问压缩机功率与运行小时', ringMax: 80,
    fields: [
      { key: 'eDaily', label: '能效标识日耗电', unit: 'kWh/24h', type: 'number', group: 'identity',
        default: 0.48, min: 0.1, max: 5, step: 0.01 },
      { key: 'age', label: '使用年限', type: 'select', group: 'identity', role: 'device', default: 1.0,
        options: [
          { label: '≤5年', value: 1.0 },
          { label: '6-10年', value: 1.12, tip: '密封条老化、翅片积灰会增加耗电' },
          { label: '>10年', value: 1.25, tip: '效率下降明显，建议考虑换新一级能效' },
        ] },
      { key: 'qty', label: '数量', unit: '台', type: 'number', group: 'usage', default: 1, min: 1, step: 1 },
      { key: 'door', label: '开关门频率', type: 'select', group: 'behavior', role: 'behavior', default: 1.08,
        options: [
          { label: '很少开', value: 0.95 },
          { label: '普通家庭（3-4口）', value: 1.08 },
          { label: '频繁（小孩/开放式厨房）', value: 1.2 },
        ] },
      { key: 'setCold', label: '温控档位', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '弱冷（省约10%）', value: 0.9 },
          { label: '中档', value: 1.0 },
          { label: '强冷/常用速冻', value: 1.18, tip: '冷藏不必低于4℃，强冷明显费电' },
        ] },
      { key: 'place', label: '放置位置', type: 'select', group: 'env', role: 'climate', default: 1.0,
        options: [
          { label: '空调房（约24℃）', value: 0.9 },
          { label: '室内常温（26-28℃）', value: 1.0 },
          { label: '高温厨房/封闭阳台', value: 1.25, tip: '环温每升1℃耗电约+3~6%' },
        ] },
    ],
    presets: {
      key: 'eDaily',
      items: [
        { label: '双门·一级 0.48', value: 0.48 },
        { label: '双门·三级 0.70', value: 0.7 },
        { label: '对开·一级 0.70', value: 0.7 },
        { label: '对开·三级 1.00', value: 1.0 },
        { label: '冷柜·一级 0.55', value: 0.55 },
      ], unit: '',
    },
  },

  /* ---------- 洗衣机（循环批次模型） ---------- */
  washer: {
    id: 'washer', name: '洗衣机', icon: '🧺', model: 'cycle',
    desc: '滚筒耗电大头在加热水，按「次数 × 单次电耗」计算更准', ringMax: 40,
    fields: [
      { key: 'cycles', label: '每月洗涤次数', unit: '次', type: 'number', group: 'usage', default: 18, min: 0, step: 1 },
      { key: 'program', label: '常用程序（单次电耗）', type: 'select', group: 'identity', role: 'behavior',
        mode: 'custom', default: 0.9,
        options: [
          { label: '波轮·快洗冷水 0.12度', value: 0.12 },
          { label: '波轮·标准常温 0.20度', value: 0.2 },
          { label: '滚筒·快洗 0.25度', value: 0.25 },
          { label: '滚筒·标准常温 0.45度', value: 0.45 },
          { label: '滚筒·标准40℃ 0.90度', value: 0.9 },
          { label: '滚筒·60℃杀菌 1.50度', value: 1.5, tip: '加热水是滚筒耗电大头，非必要不用60℃' },
        ] },
      { key: 'dryFreq', label: '烘干使用频率', type: 'select', group: 'behavior', role: 'behavior',
        mode: 'custom', default: 0,
        options: [
          { label: '不用烘干', value: 0 },
          { label: '偶尔烘（约1/4次数）', value: 0.25 },
          { label: '约一半次数烘', value: 0.5 },
          { label: '每次都烘', value: 1 },
        ] },
      { key: 'dryType', label: '烘干方式', type: 'select', group: 'identity', role: 'device',
        mode: 'custom', noBest: true, default: 2.2,
        options: [
          { label: '冷凝烘干（+2.2度/次）', value: 2.2 },
          { label: '热泵烘干（+1.1度/次）', value: 1.1 },
        ] },
      { key: 'load', label: '负载习惯', type: 'select', group: 'behavior', role: 'behavior', default: 0.92,
        options: [
          { label: '满载集中洗', value: 1.0 },
          { label: '七八成满', value: 0.92 },
          { label: '半载多次', value: 1.15, tip: '半载不如攒够一桶再洗' },
        ] },
    ],
  },

  /* ---------- 储水电热水器（热水物理模型，P0 新增） ---------- */
  wh_tank: {
    id: 'wh_tank', name: '储水电热水器', icon: '🚿', model: 'hot_water',
    desc: '按用水量×温差物理计算，功率只影响烧水时长', ringMax: 160,
    fields: [
      { key: 'volume', label: '水箱容积', unit: 'L', type: 'number', group: 'identity', default: 60, min: 10, step: 10 },
      { key: 'setTemp', label: '设定温度', unit: '℃', type: 'number', group: 'identity', default: 55, min: 35, max: 75, step: 5 },
      { key: 'power', label: '加热功率（仅估时长）', unit: 'W', type: 'number', group: 'identity', default: 2000, min: 800, step: 100 },
      { key: 'showers', label: '每天淋浴人次', unit: '人次', type: 'number', group: 'usage', default: 2.4, min: 0, step: 0.2 },
      { key: 'showerL', label: '每人次淋浴用水', unit: 'L(40℃)', type: 'number', group: 'usage', default: 40, min: 20, max: 80, step: 5 },
      { key: 'otherL', label: '厨房洗手等其他热水', unit: 'L/天', type: 'number', group: 'usage', default: 15, min: 0, step: 5 },
      { key: 'tin', label: '本月进水温度', unit: '℃', type: 'number', group: 'env', role: 'climate',
        default: 27, min: 5, max: 32, step: 1,
        tip: '' },
    ],
    presets: {
      key: 'volume',
      items: [
        { label: '40L', value: 40 },
        { label: '60L', value: 60 },
        { label: '80L', value: 80 },
        { label: '100L', value: 100 },
      ], unit: '',
    },
    best: {},
  },

  /* ---------- 电视（恒功率，尺寸预设） ---------- */
  tv: {
    id: 'tv', name: '电视', icon: '📺', model: 'constant_power',
    desc: '亮度/HDR 是功耗主因，年限影响较弱', ringMax: 30,
    fields: [
      { key: 'power', label: '观看功率', unit: 'W', type: 'number', group: 'usage', default: 100, min: 10, step: 10 },
      { key: 'hours', label: '每天观看', unit: '小时', type: 'number', group: 'usage', default: 3.5, min: 0, max: 24, step: 0.5 },
      { key: 'days', label: '每月天数', unit: '天', type: 'number', group: 'usage', default: 30, min: 0, max: 31, step: 1 },
      { key: 'qty', label: '数量', unit: '台', type: 'number', group: 'usage', default: 1, min: 1, step: 1 },
      { key: 'bri', label: '画质模式', type: 'select', group: 'behavior', role: 'behavior', default: 1.0,
        options: [
          { label: '节能/暗', value: 0.8 },
          { label: '标准', value: 1.0 },
          { label: '鲜艳/高亮', value: 1.2 },
          { label: 'HDR游戏', value: 1.4, tip: 'HDR高亮模式功耗显著上升' },
        ] },
      { key: 'age', label: '使用年限', type: 'select', group: 'identity', role: 'device', default: 1.0,
        options: [
          { label: '较新', value: 1.0 },
          { label: '老旧机型', value: 1.08 },
        ] },
    ],
    presets: {
      key: 'power',
      items: [
        { label: '32寸 40W', value: 40 },
        { label: '43寸 70W', value: 70 },
        { label: '55寸 100W', value: 100 },
        { label: '65寸 140W', value: 140 },
      ], unit: '',
    },
  },

  /* ---------- 照明（户级简化，P0 新增） ---------- */
  lighting: {
    id: 'lighting', name: '照明', icon: '💡', model: 'constant_power',
    desc: '全屋灯具打包估算，不必逐盏录入', ringMax: 60,
    fields: [
      { key: 'qty', label: '灯具数量', unit: '个', type: 'number', group: 'usage', default: 6, min: 1, step: 1 },
      { key: 'hours', label: '等效全开时长', unit: '小时/天', type: 'number', group: 'usage', default: 5, min: 0, max: 24, step: 0.5 },
      { key: 'days', label: '每月天数', unit: '天', type: 'number', group: 'usage', default: 30, min: 0, max: 31, step: 1 },
      { key: 'power', label: '平均单灯功率', unit: 'W', type: 'number', group: 'identity', default: 12, min: 1, step: 1 },
    ],
    presets: {
      key: 'pAvg',
      items: [
        { label: 'LED约12W', value: 12 },
        { label: '节能灯约25W', value: 25 },
        { label: '白炽/未改造约40W', value: 40 },
      ], unit: '',
    },
  },

  /* ---------- 常开设备（网络/机顶盒等，P0 新增） ---------- */
  alwayson: {
    id: 'alwayson', name: '常开设备', icon: '📶', model: 'always_on',
    desc: '光猫、路由、机顶盒、安防等 24 小时待机设备', ringMax: 50,
    fields: [
      { key: 'power', label: '总常开功率', unit: 'W', type: 'number', group: 'usage', default: 12, min: 1, step: 1 },
      { key: 'qty', label: '路数', unit: '路', type: 'number', group: 'usage', default: 1, min: 1, step: 1 },
    ],
    presets: {
      key: 'power',
      items: [
        { label: '光猫+路由 12W', value: 12 },
        { label: '+机顶盒 20W', value: 20 },
        { label: '+NAS/安防 30W', value: 30 },
      ], unit: '',
    },
  },
};

const DEVICE_ORDER = ['fan', 'ac', 'fridge', 'washer', 'wh_tank', 'lighting', 'tv', 'alwayson'];
