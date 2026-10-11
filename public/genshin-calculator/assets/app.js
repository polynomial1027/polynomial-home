import {
  calculatePlan,
  marginalAt,
  percentile,
  probabilityAt,
} from "./wish-engine.js";
import { analyzeCurve } from "./curve-analysis.js";

const $ = (selector) => document.querySelector(selector);
const fields = {
  characterCopies: $("#character-copies"),
  characterPity: $("#character-pity"),
  characterGuaranteed: $("#character-guaranteed"),
  radianceStreak: $("#radiance-streak"),
  weaponCopies: $("#weapon-copies"),
  weaponPity: $("#weapon-pity"),
  weaponGuaranteed: $("#weapon-guaranteed"),
  fatePoint: $("#fate-point"),
  budget: $("#budget"),
  budgetRange: $("#budget-range"),
};

const formatPercent = (value, digits = value < 0.01 ? 2 : 1) =>
  `${(value * 100).toFixed(digits)}%`;
const formatPulls = (value) => (value == null ? "未覆盖" : `${value} 抽`);
const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Number(value) || 0));

function readConfig() {
  return {
    character: {
      copies: +fields.characterCopies.value,
      pity: clamp(fields.characterPity.value, 0, 89),
      guaranteed: fields.characterGuaranteed.checked,
      radianceStreak: clamp(fields.radianceStreak.value, 0, 3),
    },
    weapon: {
      copies: +fields.weaponCopies.value,
      pity: clamp(fields.weaponPity.value, 0, 79),
      featuredGuaranteed: fields.weaponGuaranteed.checked,
      fatePoint: clamp(fields.fatePoint.value, 0, 1),
    },
  };
}

let chartState;
let cachedPlan;
let cachedKey;
let analysis;
function drawChart(cdf, budget) {
  const svg = $("#probability-chart");
  const width = 900,
    height = 330,
    left = 58,
    right = 24,
    top = 18,
    bottom = 42;
  const maxX = Math.max(
    100,
    Math.min(
      cdf.length - 1,
      Math.ceil(Math.max(budget, percentile(cdf, 0.99) || budget) / 50) * 50,
    ),
  );
  const x = (n) => left + (n / maxX) * (width - left - right);
  const y = (p) => top + (1 - p) * (height - top - bottom);
  const points = [];
  const step = Math.max(1, Math.floor(maxX / 450));
  for (let n = 0; n <= maxX; n += step)
    points.push(
      `${x(n).toFixed(1)},${y(cdf[Math.min(n, cdf.length - 1)]).toFixed(1)}`,
    );
  if (maxX % step)
    points.push(
      `${x(maxX).toFixed(1)},${y(cdf[Math.min(maxX, cdf.length - 1)]).toFixed(1)}`,
    );
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (p) =>
        `<line x1="${left}" x2="${width - right}" y1="${y(p)}" y2="${y(p)}"/><text x="${left - 12}" y="${y(p) + 4}" text-anchor="end">${Math.round(p * 100)}%</text>`,
    )
    .join("");
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((maxX * i) / 5))
    .map(
      (n) =>
        `<text x="${x(n)}" y="${height - 13}" text-anchor="middle">${n}</text>`,
    )
    .join("");
  const b = Math.min(maxX, budget),
    probability = cdf[Math.min(budget, cdf.length - 1)];
  chartState = { cdf, maxX, x, y };
  svg.setAttribute("tabindex", "0");
  svg.setAttribute(
    "aria-label",
    "概率星图：悬停查看，点击或拖动设为预算，左右键调整一抽",
  );
  svg.innerHTML = `<g class="chart-grid">${grid}${ticks}</g><path class="chart-area" d="M${x(0)},${y(0)} L${points.join(" L")} L${x(maxX)},${y(0)} Z"/><polyline class="chart-line" points="${points.join(" ")}"/><line class="budget-line" x1="${x(b)}" x2="${x(b)}" y1="${top}" y2="${y(0)}"/><circle class="budget-dot" cx="${x(b)}" cy="${y(probability)}" r="6"/><text class="budget-label" x="${Math.min(width - right - 50, Math.max(left + 50, x(b)))}" y="${Math.max(top + 15, y(probability) - 15)}" text-anchor="middle">${budget} 抽 · ${formatPercent(probability)}</text>`;
}

let scheduled;
function update() {
  const config = readConfig();
  const budget = clamp(fields.budget.value, 0, 2060);
  fields.budget.value = budget;
  fields.budgetRange.max = Math.max(900, budget);
  fields.budgetRange.value = budget;

  const key = JSON.stringify(config);
  if (key !== cachedKey) {
    cachedPlan = calculatePlan(config);
    cachedKey = key;
  }
  const result = cachedPlan;
  const probability = probabilityAt(result.cdf, budget);
  const marginal = marginalAt(result.pmf, budget);
  analysis = analyzeCurve(result.cdf, +$("#cost-preference").value);
  $("#success-probability").textContent = formatPercent(
    probability,
    probability > 0.9995 ? 2 : 1,
  );
  $("#probability-fill").style.width =
    `${Math.max(0, Math.min(100, probability * 100))}%`;
  $("#marginal").textContent = formatPercent(marginal, 3);
  const goals = [];
  if (config.character.copies)
    goals.push(`限定角色 ${config.character.copies} 份`);
  if (config.weapon.copies) goals.push(`定轨武器 ${config.weapon.copies} 份`);
  $("#goal-summary").textContent = goals.length
    ? `${budget} 抽内完成：${goals.join(" + ")}`
    : "当前没有选择抽取目标";
  const n = analysis.recommended;
  $("#recommended-pulls").textContent = formatPulls(n);
  $("#recommendation-copy").textContent =
    `对应成功率 ${formatPercent(result.cdf[n], 2)}。遍历有效预算，最大化「成功率增量 × (1 − 抽数 / 数值完成区间)^偏好权重」。当前权重 ${analysis.costWeight}，数值完成区间 ${analysis.horizon} 抽；节省偏好更重视预算余量。零抽仅用于已完成的目标。这是偏好下的折中，不是固定概率门槛或唯一最优解。`;
  actions.innerHTML =
    "<span>一阶差分峰值：新增一抽的收益由上升转为下降。点击特殊点调整预算。</span>" +
    analysis.peaks
      .map(
        (p, i) =>
          `<button type="button" data-pulls="${p.pulls}">峰 ${i + 1} · ${p.pulls} 抽 · ${formatPercent(p.probability, 2)}<small>边际 +${(p.gain * 100).toFixed(3)} 个百分点</small></button>`,
      )
      .join("") +
    `<button class="recommended-choice" type="button" data-pulls="${n}">计算推荐 · ${n} 抽 · ${formatPercent(result.cdf[n], 2)}</button>`;
  $("#peak-count").textContent = `${analysis.peaks.length} 个`;
  $("#peak-highest").textContent = analysis.peaks.length
    ? formatPulls(
        analysis.peaks.reduce((a, b) => (a.gain > b.gain ? a : b)).pulls,
      )
    : "无峰值";
  $("#recommend-probability").textContent = formatPercent(result.cdf[n], 2);
  drawChart(result.cdf, budget);
  const specialPoints = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  specialPoints.innerHTML = analysis.peaks
    .filter((p) => p.pulls <= chartState.maxX)
    .map(
      (p) =>
        `<circle cx="${chartState.x(p.pulls)}" cy="${chartState.y(p.probability)}" r="5" fill="#8d75ad" stroke="#f4efe4" stroke-width="2"><title>边际峰值 ${p.pulls} 抽，成功率 ${formatPercent(p.probability, 2)}</title></circle>`,
    )
    .join("");
  chart.append(specialPoints);
  inspect(budget);
}

const chart = $("#probability-chart");
const inspector = document.createElement("div");
inspector.className = "star-inspector";
inspector.setAttribute("aria-live", "polite");
chart.closest(".chart-wrap").after(inspector);
const actions = document.createElement("div");
actions.className = "chart-actions";
inspector.after(actions);
function inspect(n) {
  if (!chartState) return;
  const probability = probabilityAt(chartState.cdf, n);
  const marginal =
    n > 0 ? probability - probabilityAt(chartState.cdf, n - 1) : 0;
  inspector.innerHTML = `<span>✦ 探索星轨</span><strong>${n} 抽</strong><span>成功概率 <b>${formatPercent(probability, 2)}</b></span><span>这一抽增加 <b>${(marginal * 100).toFixed(3)} 个百分点</b></span><span>原石预算 <b>${(n * 160).toLocaleString()}</b></span>`;
  chart.querySelector(".inspect-marker")?.remove();
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "inspect-marker");
  group.innerHTML = `<line x1="${chartState.x(n)}" x2="${chartState.x(n)}" y1="18" y2="288" stroke="#b7caff" stroke-dasharray="3 5"/><circle cx="${chartState.x(n)}" cy="${chartState.y(probability)}" r="7" fill="#f5e7bf" stroke="#8f9ad4" stroke-width="3"/>`;
  chart.append(group);
}
function pointerPulls(event) {
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
    chart.getScreenCTM().inverse(),
  );
  return Math.round(
    clamp(((point.x - 58) / 818) * chartState.maxX, 0, chartState.maxX),
  );
}
let dragging = false;
chart.addEventListener("pointerdown", (event) => {
  dragging = true;
  chart.setPointerCapture(event.pointerId);
  fields.budget.value = pointerPulls(event);
  update();
});
chart.addEventListener("pointermove", (event) => {
  const n = pointerPulls(event);
  if (dragging) {
    fields.budget.value = n;
    update();
  } else inspect(n);
});
chart.addEventListener("pointerup", () => {
  dragging = false;
});
chart.addEventListener("pointercancel", () => {
  dragging = false;
});
chart.addEventListener("pointerleave", () => {
  if (!dragging) inspect(+fields.budget.value);
});
chart.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  fields.budget.value =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? chartState.maxX
        : clamp(
            +fields.budget.value + (event.key === "ArrowRight" ? 1 : -1),
            0,
            2060,
          );
  update();
});
actions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pulls]");
  if (!button) return;
  fields.budget.value = button.dataset.pulls;
  update();
});
$("#cost-preference").addEventListener("input", update);

function scheduleUpdate() {
  clearTimeout(scheduled);
  scheduled = setTimeout(update, 25);
}
Object.values(fields).forEach((field) =>
  field.addEventListener("input", () => {
    if (field === fields.budgetRange)
      fields.budget.value = fields.budgetRange.value;
    if (field === fields.budget) fields.budgetRange.value = fields.budget.value;
    scheduleUpdate();
  }),
);

$("#reset-button").addEventListener("click", () => {
  $("#planner-form").reset();
  fields.budget.value = 300;
  fields.budgetRange.value = 300;
  update();
});

update();
