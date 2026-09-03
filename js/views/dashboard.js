/** 今日：当前状态、核心目标与可执行提示。 */

import { h, clearEl, num, mount } from '../lib/utils.js';
import { infoTip, persistentInfoTip } from '../lib/ui.js';
import { macroBar, rangeBar, splitBar } from '../lib/charts.js';
import { energyRingChart } from '../lib/energy-ring-chart.js';
import { dailyMetrics, macroSplit, KIND } from '../core/metrics.js';
import { energyRing, ringLegend } from '../core/energy-ring.js';
import { state } from '../lib/store.js';
import { GOALS } from '../core/nutrition.js';
import { FOCUS_LABEL } from '../core/advisor.js';
import { setIntent } from '../lib/nav.js';
