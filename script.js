const PLATFORM_COLORS = {
  "小红书": "#d95f6f",
  "视频号": "#32a889",
  "抖音": "#565179"
};

const METRICS = [
  ["views", "浏览量 / 播放量"],
  ["likes", "点赞"],
  ["comments", "评论"],
  ["favorites", "收藏"],
  ["shares", "转发 / 分享"],
  ["followers", "新增关注"],
  ["engagementRate", "互动率"]
];

let state = { data: null, metric: "views", charts: {} };

async function loadData() {
  const inline = document.getElementById("inlineData")?.textContent?.trim();
  if (inline) return JSON.parse(inline);
  const res = await fetch("./data.json", { cache: "no-store" });
  return res.json();
}

function fmt(n) {
  if (!Number.isFinite(n)) return "--";
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return `${Math.round(n).toLocaleString("zh-CN")}`;
}

function pct(n) {
  return `${(Number(n || 0) * 100).toFixed(2)}%`;
}

function rate(row) {
  return row.views ? (row.likes + row.comments + row.favorites + row.shares) / row.views : 0;
}

function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
}

function sums(records) {
  const total = {
    posts: records.filter(r => r.views || r.likes || r.comments || r.favorites || r.shares || !/暂无|未读到/.test(r.publish_note)).length,
    views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, followers: 0, consultations: 0, leads: 0,
    avgWatch: 0, engagementRate: 0
  };
  for (const r of records) {
    total.views += r.views || 0;
    total.likes += r.likes || 0;
    total.comments += r.comments || 0;
    total.favorites += r.favorites || 0;
    total.shares += r.shares || 0;
    total.followers += r.followers || 0;
    total.consultations += (r.consultations || 0) + (r.leads || 0);
    total.leads += r.leads || 0;
  }
  const watchRows = records.filter(r => r.avg_watch_time && r.views);
  const watchViews = watchRows.reduce((a, r) => a + r.views, 0);
  total.avgWatch = watchViews ? watchRows.reduce((a, r) => a + r.avg_watch_time * r.views, 0) / watchViews : 0;
  total.avgViews = records.length ? total.views / records.length : 0;
  total.engagementRate = total.views ? (total.likes + total.comments + total.favorites + total.shares) / total.views : 0;
  return total;
}

function getPlatformStats() {
  const byPlatform = groupBy(state.data.records, r => r.platform);
  return state.data.platforms.map(platform => ({ platform, ...sums(byPlatform[platform] || []) }));
}

function displayStat(stat, key) {
  const account = state.data.account_metrics?.[stat.platform] || {};
  return account[key] != null ? account[key] : stat[key];
}

function newFollowers(stat) {
  const account = state.data.account_metrics?.[stat.platform] || {};
  return account.new_followers != null ? account.new_followers : stat.followers;
}

function getWorks() {
  const byWork = groupBy(state.data.records, r => r.work_id);
  return Object.entries(byWork).map(([id, rows]) => ({
    id,
    title: rows[0].work_title,
    date: rows[0].publish_date,
    rows,
    totals: sums(rows),
    score: rows.reduce((a, r) => a + r.views * 0.3 + r.likes * 5 + r.comments * 8 + r.favorites * 8 + r.shares * 12 + r.followers * 15 + ((r.consultations || 0) + (r.leads || 0)) * 30, 0)
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function platformRow(work, platform) {
  return work.rows.find(r => r.platform === platform) || { platform, views: 0, likes: 0, comments: 0, favorites: 0, shares: 0, followers: 0, consultations: 0, leads: 0 };
}

function valueOf(row, metric) {
  if (metric === "engagementRate") return rate(row);
  return row[metric] || 0;
}

function renderOverview() {
  const works = getWorks();
  const publishCount = state.data.records.filter(r => !/暂无|未读到|未发布/.test(r.publish_note)).length;
  document.getElementById("workCount").textContent = `${works.length} 条作品`;
  document.getElementById("publishCount").textContent = `三平台共发布 ${publishCount} 次 · ${state.data.month}`;

  const cards = getPlatformStats().map(s => {
    const accent = PLATFORM_COLORS[s.platform];
    const account = state.data.account_metrics?.[s.platform] || {};
    const followerTotal = account.followers_total != null ? `<div class="metric total-follow"><span>总关注 / 总粉丝</span><strong>${fmt(account.followers_total)}</strong></div>` : "";
    const primaryLabel = s.platform === "小红书" ? "观看数" : "总浏览量";
    const primaryValue = s.platform === "小红书" && account.account_views != null ? account.account_views : s.views;
    const avgWatch = account.avg_watch_time != null ? account.avg_watch_time : s.avgWatch;
    const extraMetrics = [
      account.exposure != null ? `<div class="metric"><span>账号曝光数</span><strong>${fmt(account.exposure)}</strong></div>` : "",
      account.account_views != null && s.platform !== "小红书" ? `<div class="metric"><span>账号观看数</span><strong>${fmt(account.account_views)}</strong></div>` : "",
      account.profile_visits != null ? `<div class="metric"><span>主页访客</span><strong>${fmt(account.profile_visits)}</strong></div>` : ""
    ].join("");
    return `<article class="platform-card" style="--accent:${accent}">
      <div class="platform-title"><strong>${s.platform}</strong><span class="pill">${s.posts} 条发布</span></div>
      <div class="metric-list">
        <div class="metric"><span>${primaryLabel}</span><strong>${fmt(primaryValue)}</strong></div>
        <div class="metric"><span>总点赞</span><strong>${fmt(displayStat(s, "likes"))}</strong></div>
        <div class="metric"><span>总评论</span><strong>${fmt(displayStat(s, "comments"))}</strong></div>
        <div class="metric"><span>总收藏</span><strong>${fmt(displayStat(s, "favorites"))}</strong></div>
        <div class="metric"><span>总转发 / 分享</span><strong>${fmt(displayStat(s, "shares"))}</strong></div>
        <div class="metric"><span>新增关注</span><strong>${fmt(newFollowers(s))}</strong></div>
        <div class="metric"><span>平均浏览量</span><strong>${fmt(s.avgViews)}</strong></div>
        <div class="metric"><span>平均互动率</span><strong>${pct(s.engagementRate)}</strong></div>
        <div class="metric"><span>${s.platform === "小红书" ? "平均观看时长" : "平均播放时长"}</span><strong>${avgWatch ? `${avgWatch.toFixed(1)}秒` : "--"}</strong></div>
        ${extraMetrics}
        ${followerTotal}
      </div>
    </article>`;
  }).join("");
  document.getElementById("platformCards").innerHTML = cards;
}

function baseBar(id, title, labels, series) {
  if (!window.echarts) {
    document.getElementById(id).innerHTML = "<p>图表库未加载，请联网或启动本地服务后刷新。</p>";
    return;
  }
  state.charts[id]?.dispose();
  const chart = echarts.init(document.getElementById(id));
  chart.setOption({
    color: state.data.platforms.map(p => PLATFORM_COLORS[p]),
    tooltip: { trigger: "axis" },
    grid: { left: 48, right: 18, top: 42, bottom: 54 },
    legend: { top: 0 },
    xAxis: { type: "category", data: labels, axisLabel: { interval: 0, width: 80, overflow: "truncate" } },
    yAxis: { type: "value" },
    series
  });
  state.charts[id] = chart;
}

function renderCharts() {
  const stats = getPlatformStats();
  const labels = stats.map(s => s.platform);
  baseBar("viewsChart", "views", labels, [{ name: "浏览量", type: "bar", data: stats.map(s => s.views), barWidth: 34 }]);
  baseBar("likesChart", "likes", labels, [{ name: "点赞", type: "bar", data: stats.map(s => displayStat(s, "likes")), barWidth: 34 }]);
  baseBar("conversionChart", "conversion", labels, [
    { name: "新增关注", type: "bar", data: stats.map(s => newFollowers(s)), barWidth: 34 }
  ]);
  renderWorkChart();
}

function renderMetricSwitch() {
  document.getElementById("metricSwitch").innerHTML = METRICS.map(([key, label]) =>
    `<button class="${key === state.metric ? "active" : ""}" data-metric="${key}">${label}</button>`
  ).join("");
  document.getElementById("metricSwitch").addEventListener("click", event => {
    const btn = event.target.closest("button");
    if (!btn) return;
    state.metric = btn.dataset.metric;
    renderMetricSwitch();
    renderWorkChart();
  }, { once: true });
}

function renderWorkChart() {
  const works = getWorks();
  const metricLabel = METRICS.find(([k]) => k === state.metric)[1];
  document.getElementById("workChartTitle").textContent = `每条作品三平台${metricLabel}`;
  const labels = works.map(w => w.title);
  const series = state.data.platforms.map(platform => ({
    name: platform,
    type: "bar",
    data: works.map(w => valueOf(platformRow(w, platform), state.metric)),
    barMaxWidth: 28
  }));
  baseBar("workCompareChart", state.metric, labels, series);
}

function renderRawDataTable() {
  const works = getWorks();
  const platformHeaders = state.data.platforms.map(p => `<th colspan="6">${p}</th>`).join("");
  const metricHeaders = state.data.platforms.map(() => `
    <th>浏览/播放</th>
    <th>点赞</th>
    <th>评论</th>
    <th>收藏</th>
    <th>转发</th>
    <th>关注</th>
  `).join("");
  const rows = works.map(w => {
    const cells = state.data.platforms.map(platform => {
      const row = platformRow(w, platform);
      const empty = !row.views && !row.likes && !row.comments && !row.favorites && !row.shares && !row.followers;
      return `
        <td class="${empty ? "muted-cell" : ""}">${fmt(row.views || 0)}</td>
        <td>${fmt(row.likes || 0)}</td>
        <td>${fmt(row.comments || 0)}</td>
        <td>${fmt(row.favorites || 0)}</td>
        <td>${fmt(row.shares || 0)}</td>
        <td>${fmt(row.followers || 0)}</td>
      `;
    }).join("");
    return `<tr>
      <td class="date-cell">${w.date}</td>
      <td class="title-cell">${w.title}</td>
      ${cells}
    </tr>`;
  }).join("");
  document.getElementById("rawDataTable").innerHTML = `
    <thead>
      <tr><th rowspan="2">日期</th><th rowspan="2">标题</th>${platformHeaders}</tr>
      <tr>${metricHeaders}</tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function strongestPlatform(work) {
  return [...work.rows].sort((a, b) => b.views - a.views)[0]?.platform || "--";
}

function tagFor(work) {
  const strong = strongestPlatform(work);
  const total = work.totals;
  if (total.shares >= 40) return "转发强";
  if (strong === "视频号") return "视频号最强";
  if (strong === "小红书") return "小红书更适合";
  if (strong === "抖音" && total.views > 1500) return "抖音有爆点";
  if (total.views > 3000 && total.followers === 0) return "播放高但转化弱";
  return "值得复用";
}

function renderLeaderboard() {
  const top = getWorks().sort((a, b) => b.score - a.score).slice(0, 5);
  document.getElementById("leaderboard").innerHTML = top.map((w, i) => `
    <div class="rank-row">
      <div class="rank-no">#${i + 1}</div>
      <div class="rank-title"><strong>${w.title}</strong><small>${w.date} · <span class="tag">${tagFor(w)}</span></small></div>
      <div class="rank-cell"><span>总浏览</span><strong>${fmt(w.totals.views)}</strong></div>
      <div class="rank-cell"><span>总点赞</span><strong>${fmt(w.totals.likes)}</strong></div>
      <div class="rank-cell"><span>总转发</span><strong>${fmt(w.totals.shares)}</strong></div>
      <div class="rank-cell"><span>最强平台</span><strong>${strongestPlatform(w)}</strong></div>
      <div class="rank-cell"><span>综合分</span><strong>${fmt(w.score)}</strong></div>
    </div>
  `).join("");
}

function renderReview() {
  const stats = getPlatformStats();
  const video = stats.find(s => s.platform === "视频号");
  const xhs = stats.find(s => s.platform === "小红书");
  const dy = stats.find(s => s.platform === "抖音");
  const top = getWorks().sort((a, b) => b.score - a.score)[0];
  const xhsAccount = state.data.account_metrics["小红书"];
  const dyAccount = state.data.account_metrics["抖音"];
  document.getElementById("monthlyReview").innerHTML = `
    <article class="review-summary">
      <h3>本月整体判断</h3>
      <p>视频号承担主传播，作品播放 ${fmt(video.views)}；小红书近30日曝光 ${fmt(xhsAccount.exposure)}、观看 ${fmt(xhsAccount.account_views)}，适合搜索沉淀；抖音近30日播放 ${fmt(dyAccount.account_views)}、总粉丝 ${fmt(dyAccount.followers_total)}，需要更强前三秒冲突。最强单条是《${top.title}》。</p>
    </article>
    <div class="review-kpis">
      <article><span>主传播平台</span><strong>视频号</strong><small>${fmt(video.views)} 播放 / ${fmt(displayStat(video, "shares"))} 分享</small></article>
      <article><span>小红书沉淀</span><strong>${fmt(xhsAccount.exposure)}</strong><small>近30日曝光，点赞 ${fmt(xhsAccount.likes)}</small></article>
      <article><span>抖音账号盘</span><strong>${fmt(dyAccount.account_views)}</strong><small>近30日播放，新增关注 ${fmt(newFollowers(dy))}</small></article>
      <article><span>首要动作</span><strong>强化承接</strong><small>标题、评论区和主页路径要更一致</small></article>
    </div>
    <article class="review-table-card">
      <h3>复盘重点</h3>
      <div class="review-table">
        <div class="review-row head"><span>方向</span><span>数据证据</span><span>判断</span><span>下月动作</span></div>
        <div class="review-row"><span>Offer 后适配</span><span>TOP 内容视频号 ${fmt(platformRow(top, "视频号").views)} 播放</span><span>比报喜式介绍更能触发转发</span><span>做“拿到 offer 后怎么选”系列</span></div>
        <div class="review-row"><span>小红书搜索</span><span>曝光 ${fmt(xhsAccount.exposure)}，收藏 ${fmt(displayStat(xhs, "favorites"))}</span><span>适合清单、避坑、择校判断</span><span>标题前置学校名 + 风险词</span></div>
        <div class="review-row"><span>视频号转发</span><span>分享 ${fmt(displayStat(video, "shares"))}，播放 ${fmt(video.views)}</span><span>适合判断型、家庭共识型内容</span><span>结尾固定私信关键词</span></div>
        <div class="review-row"><span>抖音冲突</span><span>近30日播放 ${fmt(dyAccount.account_views)}，净增 ${fmt(dyAccount.net_followers)}</span><span>流量有盘子，但转粉偏弱</span><span>前三秒用“你以为/其实/最怕”</span></div>
      </div>
    </article>
    <div class="platform-judgement">
      <article><h3>小红书</h3><p>重点做搜索沉淀：学校名、风险词、清单化正文和评论区关键词。</p></article>
      <article><h3>视频号</h3><p>继续承担主传播：判断先行，结尾给明确私信理由。</p></article>
      <article><h3>抖音</h3><p>单独剪节奏：开头更短、更冲突，减少直接搬运。</p></article>
    </div>
  `;
}

function renderPlan() {
  document.getElementById("nextPlan").innerHTML = `
    <div class="plan-grid">
      <article class="plan-card"><h3>下个月内容主线</h3><ul>
        <li>拿到 offer 后怎么选：适合三平台，目标是转发和关注。</li>
        <li>上海国际部录取门槛拆解：适合小红书、视频号，目标是搜索沉淀。</li>
        <li>外籍学校与国际部路径差异：适合视频号、抖音，目标是播放和评论。</li>
        <li>中考后转轨家庭预算：适合小红书、视频号，目标是收藏和关注。</li>
        <li>学校适配风险判断：适合三平台，目标是系列化复用。</li>
      </ul></article>
      <article class="plan-card"><h3>三平台分发策略</h3><ul>
        <li><strong>小红书：</strong>发择校清单、避坑、学校对比；标题前置学校名和风险词，正文用 checklist 承接。</li>
        <li><strong>视频号：</strong>发判断型、转发型内容；开头直接给结论，结尾引导私信关键词。</li>
        <li><strong>抖音：</strong>发冲突更强的短版；前三秒放“你以为/其实/最怕”句式，提高完播和评论。</li>
      </ul></article>
      <article class="plan-card full"><h3>下个月选题建议</h3><div class="topic-list">
        ${[
          ["上海家长最容易选错的，不是学校，是路径", "三平台", "封面：别先选学校", "关键词：上海择校,国际学校,路径规划"],
          ["平和、上中、上实都录了，最后怎么选才不后悔", "视频号/小红书", "封面：录了也别乱选", "关键词：平和,上中,上实"],
          ["中考后转轨国际部，最晚什么时候必须动", "三平台", "封面：别拖到中考后", "关键词：中考转轨,国际部"],
          ["外籍学校不是有护照就稳，家长最容易卡在这里", "小红书/抖音", "封面：护照不等于入场券", "关键词：外籍学校,入学资格"],
          ["上海国际学校学费贵，真正贵的是这三笔隐形账", "三平台", "封面：学费只是第一笔", "关键词：国际学校学费"],
          ["包玉刚、星河湾、平和，适合的孩子完全不一样", "视频号/小红书", "封面：别只看名气", "关键词：包玉刚,星河湾,平和"],
          ["幼升小体制外家庭，暑假先补英语还是先看学校", "小红书", "封面：别补错顺序", "关键词：幼升小,体制外"],
          ["摇号失败后转国际学校，最怕家长做这一步", "三平台", "封面：摇号失败别乱冲", "关键词：摇号失败,国际学校"],
          ["上中国际强，但不是每个孩子都适合冲", "抖音/视频号", "封面：强校也会不适配", "关键词：上中国际"],
          ["德威、哈罗、惠灵顿，外籍学校到底看什么", "小红书/视频号", "封面：别只看学费", "关键词：德威,哈罗,惠灵顿"]
        ].map(t => `<div class="topic"><strong>${t[0]}</strong><span>适合平台：${t[1]}</span><span>爆点原因：上海本地化 + 家长风险感</span><span>${t[2]}</span><span>发布文案：先给判断，再给适配条件，最后引导评论区关键词。</span><span>${t[3]}</span><span>预期目标：播放 / 转发 / 关注</span></div>`).join("")}
      </div></article>
      <article class="plan-card"><h3>下个月重点测试动作</h3><ul>
        <li>同一条视频三平台标题差异化测试：看小红书收藏率、视频号转发率、抖音完播率。</li>
        <li>小红书封面强风险词测试：成功标准是收藏率提升。</li>
        <li>视频号结尾关注钩子测试：成功标准是新增关注提升。</li>
        <li>抖音前三秒冲突开头测试：成功标准是单条播放超过当前均值 2 倍。</li>
        <li>爆款内容系列化复用测试：成功标准是同系列连续 3 条进入 TOP 5。</li>
      </ul></article>
      <article class="plan-card"><h3>下个月数据关注指标</h3><ul>
        <li>三平台总浏览量、单条作品三平台表现差异、小红书收藏率。</li>
        <li>视频号转发率、抖音完播率、三平台新增关注。</li>
        <li>爆款内容复用效果、评论区有效互动数量。</li>
      </ul></article>
    </div>
  `;
}

function renderAll() {
  renderOverview();
  renderMetricSwitch();
  renderCharts();
  renderRawDataTable();
  renderLeaderboard();
  renderReview();
  renderPlan();
  window.addEventListener("resize", () => Object.values(state.charts).forEach(c => c.resize()));
}

loadData().then(data => {
  state.data = data;
  renderAll();
}).catch(err => {
  document.body.innerHTML = `<main class="page-shell"><section class="section"><h1>数据没有加载成功</h1><p>请在当前文件夹启动本地预览服务后打开 dashboard.html。错误信息：${err.message}</p></section></main>`;
});
