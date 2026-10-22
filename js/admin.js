/* 猫神会员礼系统 · 管理后台（纯静态、浏览器本地数据） */
(function () {
  "use strict";

  const C = window.Cathen;
  const DB = window.CathenDB;
  const SESSION_KEY = "catshen_admin_session";
  const FAIL_KEY = "catshen_admin_failures";
  const SESSION_HOURS = 12;

  const state = {
    tab: "overview",
    site: {},
    campaigns: [],
    submissions: [],
    filters: { campaignId: "", q: "" },
    loggedIn: false
  };

  const app = C.$("#admin-app");

  function readSession() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (!value || Number(value.expiresAt || 0) < Date.now()) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  function writeSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000 }));
    } catch (error) {
      /* ignore */
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function applyChrome() {
    const title = state.site.siteTitle || "猫神会员礼系统";
    C.$$("[data-site-title]").forEach((node) => {
      node.textContent = title;
    });
    document.title = `管理后台 · ${title}`;
    const logout = C.$("[data-admin-logout]");
    if (logout) logout.hidden = !state.loggedIn;
    const links = C.$$(".main-nav a");
    if (links[0]) links[0].href = "index.html";
    if (links[1]) links[1].href = "index.html?preview=1";
  }

  async function boot() {
    applyChrome();
    const logout = C.$("[data-admin-logout]");
    if (logout) {
      logout.addEventListener("click", () => {
        clearSession();
        state.loggedIn = false;
        renderLogin();
        applyChrome();
      });
    }
    const auth = await DB.getAdminAuth();
    if (!auth) {
      renderSetup();
      return;
    }
    if (!readSession()) {
      renderLogin();
      return;
    }
    state.loggedIn = true;
    await initAdmin();
  }

  async function loadData() {
    await DB.ensureAdminCampaigns();
    state.site = await DB.getSiteSettings();
    state.campaigns = await DB.listCampaigns(true);
    state.submissions = await DB.listSubmissions({});
    applyChrome();
  }

  async function initAdmin() {
    await loadData();
    renderShell();
  }

  async function refresh() {
    await loadData();
    renderShell();
  }

  function renderSetup() {
    state.loggedIn = false;
    applyChrome();
    app.innerHTML = `
      <section class="admin-auth-page">
        <div class="admin-auth-card">
          <p class="eyebrow"><span></span> FIRST TIME SETUP</p>
          <h1>设置管理员密码</h1>
          <p class="lead">这是活动设置后台。密码用于保护当前浏览器中的活动、示例图和离线资料包；Tally 在线提交另由你的 Tally 账号保护。</p>
          <div class="form-alert form-alert-warning"><strong>请先了解</strong><p>Tally 表单提交会进入 Tally 后台，不会出现在这里；只有旧版离线资料包需要导入。后台设置和标题仍只保存在这台设备。</p></div>
          <form data-setup-form novalidate>
            <div class="field"><label for="setup-password">管理员密码</label><input class="text-input" id="setup-password" type="password" minlength="8" autocomplete="new-password" placeholder="至少 8 位"></div>
            <div class="field"><label for="setup-confirm">再次输入密码</label><input class="text-input" id="setup-confirm" type="password" minlength="8" autocomplete="new-password" placeholder="再次输入"></div>
            <label class="consent-row"><input type="checkbox" id="setup-ack"> <span>我了解：清除浏览器数据会导致后台资料丢失；后台密码无法找回，只能清空本地数据重设。</span></label>
            <p class="field-error" data-error-for="setup"></p>
            <button class="btn btn-primary btn-block" type="submit">创建后台并进入</button>
          </form>
          <p class="panel-fineprint">如果这是别人发给你的网页，请先确认这是你自己的部署地址，再设置密码。</p>
        </div>
      </section>`;
    C.$("[data-setup-form]").addEventListener("submit", handleSetup);
  }

  async function handleSetup(event) {
    event.preventDefault();
    const password = C.$("#setup-password").value;
    const confirm = C.$("#setup-confirm").value;
    const ack = C.$("#setup-ack").checked;
    const error = C.$("[data-error-for='setup']");
    error.textContent = "";
    if (password.length < 8) {
      error.textContent = "管理员密码至少需要 8 位。";
      return;
    }
    if (password !== confirm) {
      error.textContent = "两次输入的密码不一致。";
      return;
    }
    if (!ack) {
      error.textContent = "请勾选确认后再继续。";
      return;
    }
    const button = C.$("[data-setup-form] button");
    button.disabled = true;
    button.textContent = "正在创建…";
    try {
      await DB.setAdminPassword(password);
      writeSession();
      state.loggedIn = true;
      await initAdmin();
      C.toast("管理员密码已设置。", "success");
    } catch (err) {
      error.textContent = err.message || "创建失败。";
    } finally {
      button.disabled = false;
      button.textContent = "创建后台并进入";
    }
  }

  function renderLogin() {
    state.loggedIn = false;
    applyChrome();
    app.innerHTML = `
      <section class="admin-auth-page">
        <div class="admin-auth-card">
          <p class="eyebrow"><span></span> ADMIN ACCESS</p>
          <h1>管理员登录</h1>
          <p class="lead">进入本地管理后台，管理会员礼活动、示例图和导入的记录。</p>
          <div class="form-alert-slot" data-login-alert></div>
          <form data-admin-login novalidate>
            <div class="field"><label for="admin-password">管理员密码</label><input class="text-input" id="admin-password" type="password" autocomplete="current-password" placeholder="请输入管理员密码"></div>
            <button class="btn btn-primary btn-block" type="submit">进入后台 <span>→</span></button>
          </form>
          <p class="panel-fineprint">密码遗失时无法通过服务器找回。只能清空当前浏览器的本地数据后重新设置，但那会同时清除记录。</p>
        </div>
      </section>`;
    C.$("[data-admin-login]").addEventListener("submit", handleAdminLogin);
    C.$("#admin-password").focus();
  }

  function failureState() {
    try {
      return JSON.parse(localStorage.getItem(FAIL_KEY) || "null") || { count: 0, lockedUntil: 0 };
    } catch (error) {
      return { count: 0, lockedUntil: 0 };
    }
  }

  function recordFailure() {
    const data = failureState();
    data.count = (data.count || 0) + 1;
    if (data.count >= 5) {
      data.lockedUntil = Date.now() + 60 * 1000;
      data.count = 0;
    }
    try {
      localStorage.setItem(FAIL_KEY, JSON.stringify(data));
    } catch (error) {
      /* ignore */
    }
  }

  function clearFailures() {
    try {
      localStorage.removeItem(FAIL_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const password = C.$("#admin-password").value;
    const alert = C.$("[data-login-alert]");
    alert.innerHTML = "";
    const fails = failureState();
    if (fails.lockedUntil && fails.lockedUntil > Date.now()) {
      alert.innerHTML = `<div class="form-alert"><strong>暂时锁定</strong><p>失败次数过多，请等待约 ${Math.ceil((fails.lockedUntil - Date.now()) / 1000)} 秒后再试。</p></div>`;
      return;
    }
    const button = C.$("[data-admin-login] button");
    button.disabled = true;
    button.textContent = "正在验证…";
    try {
      const ok = await DB.verifyAdminPassword(password);
      if (!ok) {
        recordFailure();
        alert.innerHTML = `<div class="form-alert"><strong>密码不正确</strong><p>请重新输入。连续失败会暂时锁定。</p></div>`;
        return;
      }
      clearFailures();
      writeSession();
      state.loggedIn = true;
      await initAdmin();
      C.toast("已进入管理后台。", "success");
    } catch (error) {
      alert.innerHTML = `<div class="form-alert"><strong>登录失败</strong><p>${C.escapeHtml(error.message || "请稍后重试。")}</p></div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = "进入后台 <span>→</span>";
    }
  }

  function renderShell() {
    applyChrome();
    const tallyCount = state.campaigns.filter((campaign) => C.normalizeTallyUrl(campaign.tallyUrl)).length;
    const shellWarning = tallyCount
      ? `<strong>Tally 在线收集：</strong>${tallyCount} 个活动已绑定 Tally，提交会直接进入 Tally 后台；本页只管理标题、示例图、活动设置和旧版离线资料包。修改后仍需导出 <code>js/config.js</code> 并重新部署。`
      : `纯静态备用模式：资料只保存在当前浏览器。用户不会自动上传，只有你导入对方的资料包后才能看到。修改标题/示例图后，请导出 <code>js/config.js</code> 并重新部署。`;
    const tabs = [
      ["overview", "总览"],
      ["submissions", "登记记录"],
      ["campaigns", "会员礼活动"],
      ["tally", "Tally 后台"],
      ["settings", "站点设置"]
    ];
    app.innerHTML = `
      <section class="admin-page">
        <div class="admin-heading">
          <div>
            <p class="eyebrow"><span></span> ADMIN CONSOLE</p>
            <h1>管理后台</h1>
            <p class="lead">管理多个主播的会员礼活动、标题和两张示例图；Tally 在线提交在 Tally 后台统一查看。</p>
          </div>
          <div class="admin-quick-actions">
            <button class="btn btn-primary" type="button" data-import-packages>导入离线资料包 <span>↑</span></button>
            <button class="btn btn-secondary" type="button" data-new-campaign>新增会员礼</button>
          </div>
        </div>
        <div class="static-warning${tallyCount ? " static-warning-tally" : ""}">
          <span>!</span>
          <p>${shellWarning}</p>
        </div>
        <nav class="admin-tabs" aria-label="后台导航">
          ${tabs.map(([id, label]) => `<button type="button" class="admin-tab${state.tab === id ? " is-active" : ""}" data-tab="${id}">${label}</button>`).join("")}
        </nav>
        <div data-admin-content></div>
      </section>`;
    C.$$("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.getAttribute("data-tab");
        renderShell();
      });
    });
    const headerImport = C.$(".admin-heading [data-import-packages]");
    if (headerImport) headerImport.addEventListener("click", choosePackages);
    const headerNew = C.$(".admin-heading [data-new-campaign]");
    if (headerNew) headerNew.addEventListener("click", () => openCampaignEditor(null));
    renderTab();
  }

  async function renderTab() {
    const content = C.$("[data-admin-content]");
    if (!content) return;
    if (state.tab === "overview") content.innerHTML = overviewHtml();
    if (state.tab === "submissions") content.innerHTML = submissionsHtml();
    if (state.tab === "campaigns") content.innerHTML = campaignsHtml();
    if (state.tab === "tally") content.innerHTML = tallyAdminHtml();
    if (state.tab === "settings") content.innerHTML = settingsHtml();
    bindTabEvents(content);
    if (state.tab === "settings") await renderStorageInfo();
  }

  function filteredSubmissions() {
    const { campaignId, q } = state.filters;
    let rows = state.submissions;
    if (campaignId) rows = rows.filter((row) => row.campaignId === campaignId);
    if (q) {
      const key = q.toLowerCase();
      rows = rows.filter((row) =>
        [row.phone, row.wechat, row.douyin, row.campaignTitle, row.campaignType, row.honoree, row.province, row.city, row.addressDetail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(key))
      );
    }
    return rows;
  }

  function overviewHtml() {
    const today = C.formatDate(C.nowIso(), false);
    const tallyCampaigns = state.campaigns.filter((campaign) => C.normalizeTallyUrl(campaign.tallyUrl));
    const stats = {
      total: state.submissions.length,
      today: state.submissions.filter((row) => C.formatDate(row.createdAt, false) === today).length,
      active: state.campaigns.filter((campaign) => campaign.active).length,
      campaigns: state.campaigns.length
    };
    const recent = state.submissions.slice(0, 5);
    const sourceWarning = tallyCampaigns.length
      ? `<strong>Tally 在线收集已启用：</strong>${tallyCampaigns.length} 个活动已绑定 Tally 表单。通过 Tally 提交的资料在 <a href="https://tally.so/forms" target="_blank" rel="noopener">Tally 后台</a>查看，不会出现在本页。本页只显示本机活动设置和离线资料包记录。`
      : `纯静态后台：资料只保存在当前浏览器。用户不会自动上传，只有你导入对方的资料包后才能看到。修改标题/示例图后，请导出 <code>js/config.js</code> 并重新部署，访客才能看到。`;
    return `
      <div class="stat-grid">
        <div class="stat-card"><span>本机登记</span><strong>${stats.total}</strong><small>份资料</small></div>
        <div class="stat-card"><span>今日新增</span><strong>${stats.today}</strong><small>份资料</small></div>
        <div class="stat-card"><span>Tally 活动</span><strong>${tallyCampaigns.length}</strong><small>/ ${stats.campaigns} 个</small></div>
        <div class="stat-card"><span>数据位置</span><strong class="stat-word">${tallyCampaigns.length ? "Tally + 本机" : "本机"}</strong><small>${tallyCampaigns.length ? "Tally 云端 + 浏览器" : "浏览器 IndexedDB"}</small></div>
      </div>
      <div class="quick-grid">
        <button class="quick-card" type="button" data-quick="tally"><span class="quick-icon">T</span><strong>打开 Tally 后台</strong><p>查看所有 Tally 在线提交、图片下载与 CSV 导出。</p></button>
        <button class="quick-card" type="button" data-quick="import"><span class="quick-icon">↑</span><strong>导入离线资料包</strong><p>仅用于旧版离线资料包，不是 Tally 提交。</p></button>
        <button class="quick-card" type="button" data-quick="campaign"><span class="quick-icon">＋</span><strong>新建会员礼</strong><p>为不同主播创建季度、月度或其他房管会员礼。</p></button>
        <button class="quick-card" type="button" data-quick="config"><span class="quick-icon">↗</span><strong>导出站点配置</strong><p>修改标题/示例图后，导出 config.js 重新部署。</p></button>
      </div>
      <div class="table-card">
        <div class="table-card-head"><div><p class="form-kicker">OFFLINE RECENT</p><h2>最近离线资料包</h2></div><span class="table-count">当前 ${state.submissions.length} 份</span></div>
        ${recent.length ? submissionTable(recent, true) : emptyRecords("还没有离线资料包", "Tally 在线提交不会出现在这里；请到 Tally 后台查看。")}
      </div>
      <div class="static-warning static-warning-tally"><span>!</span><p>${sourceWarning}</p></div>`;
  }

  function submissionTable(rows, compact) {
    return `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>手机号</th><th>会员礼</th><th>微信昵称</th><th>抖音昵称</th><th>收货地址</th><th>更新时间</th><th></th></tr></thead>
          <tbody>${rows.map((row) => `
            <tr>
              <td><button class="table-primary button-link" type="button" data-view-submission="${C.escapeHtml(row.key)}">${C.escapeHtml(row.phone)}</button><span class="table-sub">${row.source === "imported" ? "已导入" : "本机登记"}</span></td>
              <td>${C.escapeHtml(row.campaignTitle)}<span class="table-sub">${C.escapeHtml(row.campaignType)}${row.honoree ? ` · ${C.escapeHtml(row.honoree)}` : ""}</span></td>
              <td>${C.escapeHtml(row.wechat)}</td>
              <td>${C.escapeHtml(row.douyin)}</td>
              <td class="address-cell" title="${C.escapeHtml(row.province + " " + row.city + " " + row.addressDetail)}">${C.escapeHtml(row.province + " " + row.city + " " + row.addressDetail)}</td>
              <td class="nowrap">${C.formatDate(row.updatedAt)}</td>
              <td><button class="btn btn-tiny" type="button" data-view-submission="${C.escapeHtml(row.key)}">查看</button></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function submissionsHtml() {
    const rows = filteredSubmissions();
    const campaignOptions = allCampaignsForFilter();
    const tallyCampaigns = state.campaigns.filter((campaign) => C.normalizeTallyUrl(campaign.tallyUrl));
    const tallyNotice = tallyCampaigns.length
      ? `<div class="static-warning static-warning-tally"><span>!</span><p><strong>Tally 在线提交不在这里。</strong>已绑定 Tally 的活动共有 ${tallyCampaigns.length} 个，请到 <a href="https://tally.so/forms" target="_blank" rel="noopener">Tally 后台</a>查看提交、图片和导出。本页只显示旧版离线资料包记录。</p></div>`
      : "";
    return `
      <div class="tab-heading">
        <div><p class="form-kicker">OFFLINE RECORDS</p><h2>离线资料包记录</h2><p>这里只显示导入本浏览器的旧版 JSON 资料包。Tally 在线表单的记录在 Tally 后台。</p></div>
        <div class="tab-actions"><button class="btn btn-primary" type="button" data-import-packages>导入离线资料包</button><button class="btn btn-secondary" type="button" data-export-csv>导出本机 CSV</button></div>
      </div>
      ${tallyNotice}
      <div class="filter-bar">
        <form data-filter-form class="filter-form">
          <select class="text-input select-input" name="campaignId" aria-label="按会员礼筛选">
            <option value="">全部会员礼</option>
            ${campaignOptions.map((item) => `<option value="${C.escapeHtml(item.id)}"${state.filters.campaignId === item.id ? " selected" : ""}>${C.escapeHtml(item.title)}</option>`).join("")}
          </select>
          <input class="text-input" type="search" name="q" value="${C.escapeHtml(state.filters.q)}" placeholder="搜索手机号、昵称、主播或地址">
          <button class="btn btn-secondary" type="submit">筛选</button>
          ${state.filters.campaignId || state.filters.q ? `<button class="btn btn-ghost" type="button" data-clear-filter>清空</button>` : ""}
        </form>
        <span class="table-count">当前 ${rows.length} 份</span>
      </div>
      <div class="table-card">
        ${rows.length ? submissionTable(rows) : emptyRecords("没有离线资料包记录", "Tally 在线提交请到 Tally 后台查看。")}
      </div>`;
  }

  function allCampaignsForFilter() {
    const map = new Map();
    state.campaigns.forEach((campaign) => map.set(campaign.id, campaign));
    state.submissions.forEach((submission) => {
      if (!map.has(submission.campaignId)) {
        map.set(submission.campaignId, {
          id: submission.campaignId,
          title: submission.campaignTitle,
          type: submission.campaignType
        });
      }
    });
    return Array.from(map.values());
  }

  function campaignsHtml() {
    return `
      <div class="tab-heading">
        <div><p class="form-kicker">CAMPAIGNS</p><h2>主播会员礼活动</h2><p>每个活动可以对应不同主播 / 频道，设置标题、房管会员礼类型、两张示例图和 Tally 表单链接。</p></div>
        <div class="tab-actions"><button class="btn btn-primary" type="button" data-new-campaign>新增会员礼</button><button class="btn btn-secondary" type="button" data-export-config>导出 config.js</button></div>
      </div>
      ${state.campaigns.length ? `<div class="campaign-admin-grid">${state.campaigns.map(campaignAdminCard).join("")}</div>` : `<div class="empty-panel"><h3>还没有会员礼活动</h3><p>新增一个，填写主播、标题和示例图后导出配置。</p><button class="btn btn-primary" type="button" data-new-campaign>新增会员礼</button></div>`}
      <div class="admin-note"><strong>发布提示：</strong>活动标题、示例图和 Tally 表单链接修改会先保存在本机。点击「导出 config.js」，替换项目里的 <code>js/config.js</code>，提交到 GitHub 后访客才会看到。</div>`;
  }

  function campaignAdminCard(campaign) {
    const count = state.submissions.filter((row) => row.campaignId === campaign.id).length;
    const tallyUrl = C.tallyPublicUrl(campaign.tallyUrl);
    const modePill = tallyUrl
      ? '<span class="tally-pill">Tally 在线</span>'
      : campaign.allowOffline
        ? '<span class="tally-pill is-offline">离线资料包</span>'
        : '<span class="tally-pill is-offline">待配置</span>';
    return `
      <article class="admin-campaign-card${campaign.active ? "" : " is-inactive"}">
        <div class="campaign-top"><div class="campaign-tags"><span class="type-pill">${C.escapeHtml(campaign.type)}</span>${modePill}</div><span class="status-pill${campaign.active ? "" : " is-muted"}"><i></i>${campaign.active ? "已启用" : "已停用"}</span></div>
        <h3>${C.escapeHtml(campaign.title)}</h3>
        <p class="honoree">${campaign.honoree ? `主播 / 频道 · ${C.escapeHtml(campaign.honoree)}` : "未填写主播 / 频道"}</p>
        <p class="admin-campaign-desc">${C.escapeHtml(campaign.description || "暂无活动说明")}</p>
        <div class="mini-examples">
          <figure><img src="${C.escapeHtml(C.safeImageSrc(campaign.exampleDiamond))}" alt="钻石消费记录示例"><figcaption>钻石消费记录</figcaption></figure>
          <figure><img src="${C.escapeHtml(C.safeImageSrc(campaign.exampleExpiry))}" alt="会员截止日期示例"><figcaption>会员截止日期</figcaption></figure>
        </div>
        <div class="campaign-stats"><span>${count} 份离线资料</span><span>${campaign.deadline ? "截止 " + C.formatDeadline(campaign.deadline) : "长期有效"}</span></div>
        <div class="admin-campaign-actions">
          <button class="btn btn-tiny" type="button" data-edit-campaign="${C.escapeHtml(campaign.id)}">编辑</button>
          ${tallyUrl ? `<a class="btn btn-tiny" href="${C.escapeHtml(tallyUrl)}" target="_blank" rel="noopener">Tally 表单 ↗</a>` : ""}
          <button class="btn btn-tiny" type="button" data-toggle-campaign="${C.escapeHtml(campaign.id)}">${campaign.active ? "停用" : "启用"}</button>
          <button class="btn btn-tiny" type="button" data-copy-campaign="${C.escapeHtml(campaign.id)}">复制页面链接</button>
          <button class="btn btn-tiny" type="button" data-duplicate-campaign="${C.escapeHtml(campaign.id)}">复制活动</button>
          <button class="text-button danger-text" type="button" data-delete-campaign="${C.escapeHtml(campaign.id)}">删除</button>
        </div>
      </article>`;
  }

  const TALLY_FIELD_CHECKLIST = [
    "收件人手机号（Number / 必填，限制 11 位）",
    "微信会员群昵称（Short answer / 必填）",
    "抖音昵称（Short answer / 必填）",
    "省份（Short answer / 必填）",
    "城市（Short answer / 必填）",
    "详细地址（Long answer / 必填，提醒写到街道门牌）",
    "钻石消费记录（File upload / 必填 / 仅图片 / 单张≤10MB）",
    "会员截止日期记录（File upload / 必填 / 仅图片 / 单张≤10MB）",
    "同意（Checkbox / 必填）"
  ].join("\n");

  function tallyAdminHtml() {
    const bound = state.campaigns.filter((campaign) => C.normalizeTallyUrl(campaign.tallyUrl));
    return `
      <div class="tab-heading">
        <div><p class="form-kicker">TALLY BACKEND</p><h2>Tally 后台</h2><p>使用 Tally 免费版接收表单和两张图片。提交会直接进入 Tally 后台，不再需要用户发送 JSON 文件。</p></div>
        <div class="tab-actions"><a class="btn btn-primary" href="https://tally.so/forms" target="_blank" rel="noopener">打开 Tally 表单后台 ↗</a></div>
      </div>
      <div class="tally-benefits">
        <div><strong>不限提交数</strong><span>免费版不限表单和提交数量（遵守合理使用）</span></div>
        <div><strong>两张图片</strong><span>文件上传免费，单张最大 10MB</span></div>
        <div><strong>后台留存</strong><span>提交和图片保存在 Tally，不经过邮件</span></div>
        <div><strong>可导出</strong><span>支持 CSV、附件下载和 Google Sheets</span></div>
      </div>

      <div class="settings-grid">
        <div class="settings-card">
          <h3>第一次使用：创建 Tally 表单</h3>
          <div class="deploy-steps">
            <p><span>1</span> 打开 <a class="text-link" href="https://tally.so/forms" target="_blank" rel="noopener">Tally 表单后台</a>，注册/登录。</p>
            <p><span>2</span> 新建一个表单，按下方字段清单添加字段。</p>
            <p><span>3</span> 两个 File upload 分别命名为「钻石消费记录」和「会员截止日期记录」，勾选必填和仅图片，单张≤10MB。</p>
            <p><span>4</span> 发布表单，复制分享链接或嵌入代码。</p>
            <p><span>5</span> 回到「会员礼活动」→ 编辑活动 → 粘贴到「Tally 表单链接」并保存。</p>
            <p><span>6</span> 导出 <code>config.js</code> 并重新部署，用户端才会显示 Tally 表单。</p>
          </div>
        </div>
        <div class="settings-card">
          <h3>建议开启</h3>
          <div class="tally-settings-list">
            <p><strong>防止重复提交</strong><span>在 Tally 表单的 Access 设置里开启，并选择「手机号」作为唯一字段。</span></p>
            <p><strong>一个活动一份表单</strong><span>不同主播建议各复制一份 Tally 表单，否则手机号去重可能阻碍同一房管登记多个主播的会员礼。</span></p>
            <p><strong>Google Sheets</strong><span>在 Tally 的 Integrations 中连接表格，自动备份每条提交和图片链接。</span></p>
          </div>
        </div>
      </div>

      <div class="table-card">
        <div class="table-card-head"><div><p class="form-kicker">BINDINGS</p><h2>活动与 Tally 表单绑定</h2></div><span class="table-count">${bound.length} / ${state.campaigns.length} 个已绑定</span></div>
        ${state.campaigns.length ? `<div class="table-scroll"><table class="data-table tally-table">
          <thead><tr><th>主播 / 频道</th><th>会员礼</th><th>状态</th><th>Tally 表单</th><th></th></tr></thead>
          <tbody>${state.campaigns.map((campaign) => {
            const tallyUrl = C.tallyPublicUrl(campaign.tallyUrl);
            return `<tr>
              <td>${C.escapeHtml(campaign.honoree || "—")}</td>
              <td>${C.escapeHtml(campaign.title)}<span class="table-sub">${C.escapeHtml(campaign.type)}</span></td>
              <td>${tallyUrl ? '<span class="status-pill"><i></i>Tally 在线</span>' : (campaign.allowOffline ? '<span class="status-pill is-muted"><i></i>离线备用</span>' : '<span class="status-pill is-muted"><i></i>待配置</span>')}</td>
              <td>${tallyUrl ? `<a class="text-link small" href="${C.escapeHtml(tallyUrl)}" target="_blank" rel="noopener">打开 Tally 表单 ↗</a>` : "未绑定"}</td>
              <td><button class="btn btn-tiny" type="button" data-edit-campaign="${C.escapeHtml(campaign.id)}">${tallyUrl ? "更换链接" : "绑定 Tally"}</button></td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>` : `<div class="empty-panel"><h3>还没有会员礼活动</h3><p>先创建活动，再绑定 Tally 表单。</p></div>`}
      </div>

      <div class="settings-card tally-fields-card">
        <div class="card-head"><div><h3>Tally 字段清单</h3><p class="settings-hint">在 Tally 表单里按这个顺序创建字段。隐藏字段可选：campaign、campaign_id，用于后台识别活动。</p></div><button class="btn btn-secondary" type="button" data-copy-tally-fields>复制字段清单</button></div>
        <pre class="tally-field-list">${C.escapeHtml(TALLY_FIELD_CHECKLIST)}</pre>
      </div>

      <div class="static-warning static-warning-tally"><span>!</span><p><strong>数据在 Tally，不在这个后台。</strong>本机后台只保存活动标题、示例图和旧版离线资料包。Tally 的提交、图片和导出都在 Tally 账号中，请妥善保管 Tally 登录密码。</p></div>`;
  }

  function settingsHtml() {
    return `
      <div class="tab-heading"><div><p class="form-kicker">SETTINGS</p><h2>站点设置</h2><p>修改站点标题、首页文案，或导出发布配置和完整备份。</p></div></div>
      <div class="settings-grid">
        <div class="settings-card">
          <h3>标题与首页文案</h3>
          <form data-site-form>
            <div class="field"><label for="set-site-title">系统标题</label><input class="text-input" id="set-site-title" name="siteTitle" maxlength="60" value="${C.escapeHtml(state.site.siteTitle || "")}" placeholder="猫神会员礼系统"><p class="field-hint">显示在页头、浏览器标签和资料包标题中。</p></div>
            <div class="field"><label for="set-hero-title">首页主标题</label><input class="text-input" id="set-hero-title" name="heroTitle" maxlength="120" value="${C.escapeHtml(state.site.heroTitle || "")}"><p class="field-hint">用 <code>|</code> 控制强制换行，例如「替主播，把每一份|会员礼登记清楚。」</p></div>
            <div class="field"><label for="set-hero-subtitle">首页副标题</label><textarea class="text-input textarea" id="set-hero-subtitle" name="heroSubtitle" rows="2" maxlength="300">${C.escapeHtml(state.site.heroSubtitle || "")}</textarea></div>
            <div class="field"><label for="set-notice">公开提示</label><textarea class="text-input textarea" id="set-notice" name="publicNotice" rows="3" maxlength="400">${C.escapeHtml(state.site.publicNotice || "")}</textarea><p class="field-hint">会显示在首页和登记页，提醒用户下载资料包发给管理员。</p></div>
            <button class="btn btn-primary" type="submit">保存本机设置</button>
          </form>
        </div>

        <div class="settings-card">
          <h3>发布到 GitHub Pages</h3>
          <p class="settings-copy">标题、活动、示例图和 Tally 表单链接先保存在本机；导出后替换 <code>js/config.js</code> 并重新部署，所有访客才会看到新内容。</p>
          <div class="settings-actions">
            <button class="btn btn-primary" type="button" data-export-config>导出 config.js</button>
            <a class="btn btn-secondary" href="index.html?preview=1" target="_blank" rel="noopener">预览本机设置 ↗</a>
          </div>
          <div class="deploy-steps">
            <p><span>1</span> 点击「导出 config.js」。</p>
            <p><span>2</span> 用它替换项目中的 <code>js/config.js</code>。</p>
            <p><span>3</span> 提交并推送，等待 GitHub Pages 更新。</p>
            <p><span>4</span> 打开公开链接，按 <kbd>Ctrl</kbd> + <kbd>F5</kbd> 强刷。</p>
          </div>
        </div>

        <div class="settings-card">
          <h3>完整备份与恢复</h3>
          <p class="settings-copy">备份包含管理员密码哈希、活动、示例图、所有已导入资料和两张证明图，属于敏感文件，请加密保存。</p>
          <div class="settings-actions">
            <button class="btn btn-primary" type="button" data-export-backup>导出完整备份</button>
            <button class="btn btn-secondary" type="button" data-import-backup>从备份恢复</button>
          </div>
          <p class="settings-hint">恢复会替换当前活动与记录，并保留你当前的管理员密码。</p>
        </div>

        <div class="settings-card">
          <h3>管理员密码</h3>
          <form data-password-form>
            <div class="field"><label for="current-password">当前密码</label><input class="text-input" id="current-password" type="password" autocomplete="current-password"></div>
            <div class="field-grid">
              <div class="field"><label for="new-password">新密码</label><input class="text-input" id="new-password" type="password" autocomplete="new-password" minlength="8" placeholder="至少 8 位"></div>
              <div class="field"><label for="new-password-confirm">确认新密码</label><input class="text-input" id="new-password-confirm" type="password" autocomplete="new-password"></div>
            </div>
            <p class="field-error" data-error-for="password"></p>
            <button class="btn btn-secondary" type="submit">修改密码</button>
          </form>
        </div>

        <div class="settings-card">
          <h3>存储与清理</h3>
          <p class="settings-copy" data-storage-info>正在读取浏览器存储占用…</p>
          <p class="settings-hint">清除本地数据会删除所有活动、示例图和已经导入的资料。建议先导出完整备份。</p>
          <button class="btn btn-danger" type="button" data-clear-data>清空本机后台数据</button>
        </div>

        <div class="settings-card settings-warning">
          <h3>安全边界</h3>
          <p>Tally 在线提交的数据由你的 Tally 账号保护，请给 Tally 开启强密码和两步验证。本页管理员密码只保护本机的活动设置和旧版离线资料包；这些本机数据未做端到端加密，请不要在公共电脑上使用。定期导出本机备份，Tally 数据则定期在 Tally 后台导出。</p>
        </div>
      </div>`;
  }

  async function renderStorageInfo() {
    const node = C.$("[data-storage-info]");
    if (!node) return;
    const estimate = await DB.storageEstimate();
    if (!estimate) {
      node.textContent = "当前浏览器未提供存储占用信息。";
      return;
    }
    node.textContent = `已用约 ${C.formatBytes(estimate.usage || 0)}，浏览器可用额度约 ${C.formatBytes(estimate.quota || 0)}。`;
  }

  function bindTabEvents(content) {
    C.$$("[data-import-packages]", content).forEach((button) => button.addEventListener("click", choosePackages));
    C.$$("[data-new-campaign]", content).forEach((button) => button.addEventListener("click", () => openCampaignEditor(null)));
    C.$$("[data-quick]", content).forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-quick");
        if (action === "import") choosePackages();
        if (action === "campaign") openCampaignEditor(null);
        if (action === "config") exportSiteConfig();
        if (action === "backup") exportBackup();
        if (action === "tally") {
          state.tab = "tally";
          renderShell();
        }
      });
    });
    C.$$("[data-view-submission]", content).forEach((button) => {
      button.addEventListener("click", () => {
        const submission = state.submissions.find((row) => row.key === button.getAttribute("data-view-submission"));
        if (submission) openSubmission(submission);
      });
    });
    const filter = C.$("[data-filter-form]", content);
    if (filter) {
      filter.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(filter);
        state.filters.campaignId = String(data.get("campaignId") || "");
        state.filters.q = String(data.get("q") || "").trim();
        renderTab();
      });
    }
    const clearFilter = C.$("[data-clear-filter]", content);
    if (clearFilter) {
      clearFilter.addEventListener("click", () => {
        state.filters = { campaignId: "", q: "" };
        renderTab();
      });
    }
    const csv = C.$("[data-export-csv]", content);
    if (csv) csv.addEventListener("click", exportCsv);
    C.$$("[data-edit-campaign]", content).forEach((button) => {
      button.addEventListener("click", () => {
        const campaign = state.campaigns.find((item) => item.id === button.getAttribute("data-edit-campaign"));
        if (campaign) openCampaignEditor(campaign);
      });
    });
    C.$$("[data-toggle-campaign]", content).forEach((button) => {
      button.addEventListener("click", () => toggleCampaign(button.getAttribute("data-toggle-campaign")));
    });
    C.$$("[data-duplicate-campaign]", content).forEach((button) => {
      button.addEventListener("click", () => duplicateCampaign(button.getAttribute("data-duplicate-campaign")));
    });
    C.$$("[data-copy-campaign]", content).forEach((button) => {
      button.addEventListener("click", async () => {
        const campaign = state.campaigns.find((item) => item.id === button.getAttribute("data-copy-campaign"));
        if (!campaign) return;
        const url = new URL(`index.html?gift=${encodeURIComponent(campaign.id)}`, window.location.href).href;
        const ok = await C.copyText(url);
        C.toast(ok ? "活动链接已复制。" : "复制失败，请手动复制地址栏链接。", ok ? "success" : "error");
      });
    });
    C.$$("[data-delete-campaign]", content).forEach((button) => {
      button.addEventListener("click", () => deleteCampaign(button.getAttribute("data-delete-campaign")));
    });
    C.$$("[data-export-config]", content).forEach((button) => button.addEventListener("click", exportSiteConfig));
    C.$$("[data-copy-tally-fields]", content).forEach((button) => {
      button.addEventListener("click", async () => {
        const ok = await C.copyText(TALLY_FIELD_CHECKLIST);
        C.toast(ok ? "Tally 字段清单已复制。" : "复制失败，请手动选择文本。", ok ? "success" : "error");
      });
    });
    const siteForm = C.$("[data-site-form]", content);
    if (siteForm) {
      siteForm.addEventListener("submit", saveSiteSettings);
    }
    C.$$("[data-export-backup]", content).forEach((button) => button.addEventListener("click", exportBackup));
    C.$$("[data-import-backup]", content).forEach((button) => button.addEventListener("click", importBackup));
    const passwordForm = C.$("[data-password-form]", content);
    if (passwordForm) passwordForm.addEventListener("submit", changePassword);
    const clearData = C.$("[data-clear-data]", content);
    if (clearData) clearData.addEventListener("click", clearAllData);
  }

  function emptyRecords(title, copy) {
    return `<div class="empty-panel"><span class="paw-mark">✦</span><h3>${C.escapeHtml(title || "还没有登记记录")}</h3><p>${C.escapeHtml(copy || "用户发来的资料包导入后会出现在这里。")}</p><button class="btn btn-primary" type="button" data-import-packages>导入资料包</button></div>`;
  }

  function choosePackages() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.multiple = true;
    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      await importPackages(files);
    });
    input.click();
  }

  async function importPackages(files) {
    const report = { added: 0, updated: 0, skipped: 0, errors: [] };
    const modal = C.openModal({
      title: "正在导入资料包",
      content: `<div class="import-progress"><span class="loading-cat"></span><p>正在读取 ${files.length} 个文件…请稍候。</p></div>`,
      footer: ""
    });
    for (const file of files) {
      try {
        const text = await file.text();
        const result = await DB.importPackage(text, { ensureCampaign: true, overwriteNewer: true });
        if (result.status === "added") report.added += 1;
        else if (result.status === "updated") report.updated += 1;
        else report.skipped += 1;
      } catch (error) {
        report.errors.push(`${file.name}：${error.message || "导入失败"}`);
      }
    }
    if (modal) modal.close();
    await loadData();
    renderShell();
    const rows = [
      `<p><strong>新增：</strong>${report.added} 份</p>`,
      `<p><strong>更新：</strong>${report.updated} 份</p>`,
      `<p><strong>跳过：</strong>${report.skipped} 份（已有更新版本）</p>`
    ];
    if (report.errors.length) {
      rows.push(`<div class="import-errors"><strong>以下文件未能导入：</strong><ul>${report.errors.map((message) => `<li>${C.escapeHtml(message)}</li>`).join("")}</ul></div>`);
    }
    C.openModal({
      title: "导入完成",
      content: `<div class="import-report">${rows.join("")}<p class="settings-hint">如果资料包来自新活动，该活动会以「已停用」状态创建。请到「会员礼活动」中确认标题和示例图，然后启用。</p></div>`,
      footer: `<div class="modal-actions"><button class="btn btn-primary" type="button" data-modal-close>知道了</button></div>`
    });
  }

  function openSubmission(submission) {
    const campaign = state.campaigns.find((item) => item.id === submission.campaignId);
    const content = document.createElement("div");
    content.className = "submission-detail";
    content.innerHTML = `
      <div class="detail-summary">
        <div><span class="type-pill">${C.escapeHtml(submission.campaignType)}</span><h3>${C.escapeHtml(submission.campaignTitle)}</h3><p>${submission.honoree ? "主播 / 频道 · " + C.escapeHtml(submission.honoree) : "未填写主播 / 频道"}</p></div>
        <span class="status-pill"><i></i>${C.escapeHtml(submission.source === "imported" ? "已导入" : "本机登记")}</span>
      </div>
      <dl class="detail-list">
        <div><dt>手机号</dt><dd class="mono">${C.escapeHtml(submission.phone)}</dd></div>
        <div><dt>收货地址</dt><dd>${C.escapeHtml(submission.province + " " + submission.city + " " + submission.addressDetail)}</dd></div>
        <div><dt>微信会员群昵称</dt><dd>${C.escapeHtml(submission.wechat)}</dd></div>
        <div><dt>抖音昵称</dt><dd>${C.escapeHtml(submission.douyin)}</dd></div>
        <div><dt>时间</dt><dd>首次 ${C.formatDate(submission.createdAt)} · 最近 ${C.formatDate(submission.updatedAt)}</dd></div>
      </dl>
      <div class="proof-detail-grid">
        <figure><img src="${C.escapeHtml(submission.diamondImage)}" alt="钻石消费记录"><figcaption>钻石消费记录 <button type="button" class="text-button" data-download-admin-proof="diamond">下载</button></figcaption></figure>
        <figure><img src="${C.escapeHtml(submission.expiryImage)}" alt="会员截止日期记录"><figcaption>会员截止日期记录 <button type="button" class="text-button" data-download-admin-proof="expiry">下载</button></figcaption></figure>
      </div>
      <div class="detail-code-note"><strong>用户查询码</strong><p>查询码只保存在用户自己的设备里，管理员无法查看。重置只影响当前这份本地副本，不会改变用户浏览器里的原记录。活动：${C.escapeHtml(campaign?.title || submission.campaignTitle)}</p></div>
      <div data-reset-result></div>`;
    const footer = document.createElement("div");
    footer.className = "modal-actions";
    footer.innerHTML = `
      <button class="btn btn-ghost" type="button" data-close-detail>关闭</button>
      <button class="btn btn-secondary" type="button" data-reset-code>重置本地查询码</button>
      <button class="btn btn-danger" type="button" data-delete-submission>删除记录</button>`;
    const modal = C.openModal({
      title: `资料 #${C.escapeHtml(submission.phone)}`,
      content,
      footer,
      wide: true
    });
    if (!modal) return;
    content.querySelectorAll("[data-download-admin-proof]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-download-admin-proof");
        C.downloadDataUrl(
          `${C.safeFilePart(submission.campaignTitle)}-${submission.phone}-${kind === "diamond" ? "钻石消费记录" : "会员截止日期"}.jpg`,
          kind === "diamond" ? submission.diamondImage : submission.expiryImage
        );
      });
    });
    footer.querySelector("[data-close-detail]").addEventListener("click", () => modal.close());
    footer.querySelector("[data-reset-code]").addEventListener("click", async () => {
      const confirmed = await C.confirmDialog({
        title: "重置本地查询码",
        message: "会为当前这份本地记录生成新的查询码。用户自己设备里的原查询码不会改变，请只在用户主动要求并确认身份后使用。",
        confirmText: "生成新查询码"
      });
      if (!confirmed) return;
      try {
        const code = C.generateQueryCode();
        const salt = C.randomSaltHex();
        const hash = await C.hashSecret(C.normalizeCode(code), salt, C.QUERY_ITERATIONS);
        const updated = await DB.updateSubmission(submission.key, {
          accessSalt: salt,
          accessHash: hash,
          accessIterations: C.QUERY_ITERATIONS
        });
        const result = content.querySelector("[data-reset-result]");
        result.innerHTML = `<div class="code-panel local-code-panel"><div class="code-head"><span>新的本地查询码</span><small>只显示这一次</small></div><div class="code-row"><code>${C.escapeHtml(code)}</code><button class="btn btn-code" type="button" data-copy-reset>复制</button></div><p>请通过可靠方式告诉用户，并提醒对方妥善保存。</p></div>`;
        result.querySelector("[data-copy-reset]").addEventListener("click", async () => {
          const ok = await C.copyText(code);
          C.toast(ok ? "已复制。" : "复制失败，请手动复制。", ok ? "success" : "error");
        });
        state.submissions = state.submissions.map((row) => row.key === updated.key ? updated : row);
        C.toast("本地查询码已重置。", "success");
      } catch (error) {
        C.toast(error.message || "重置失败。", "error");
      }
    });
    footer.querySelector("[data-delete-submission]").addEventListener("click", async () => {
      const confirmed = await C.confirmDialog({
        title: "删除这份记录？",
        message: "会从当前浏览器删除收货信息和两张证明图片，无法恢复。建议先导出备份。",
        confirmText: "永久删除",
        danger: true
      });
      if (!confirmed) return;
      await DB.deleteSubmission(submission.key);
      modal.close();
      await refresh();
      C.toast("记录已删除。", "success");
    });
  }

  function openCampaignEditor(existing) {
    const draft = {
      id: existing?.id || "",
      type: existing?.type || "季度会员礼",
      title: existing?.title || "",
      honoree: existing?.honoree || "",
      description: existing?.description || "",
      deadline: existing?.deadline || "",
      tallyUrl: existing?.tallyUrl || "",
      allowOffline: existing?.allowOffline === true,
      active: existing ? existing.active : true,
      exampleDiamond: existing?.exampleDiamond || "assets/example-diamond.svg",
      exampleExpiry: existing?.exampleExpiry || "assets/example-expiry.svg"
    };
    const form = document.createElement("form");
    form.className = "campaign-form";
    form.innerHTML = `
      <div class="form-grid">
        <div class="field"><label for="camp-type">会员礼类型</label><input class="text-input" id="camp-type" name="type" list="campaign-types" value="${C.escapeHtml(draft.type)}" placeholder="例如：季度会员礼"><datalist id="campaign-types"><option value="季度会员礼"><option value="月度会员礼"><option value="年度会员礼"><option value="生日会员礼"></datalist></div>
        <div class="field"><label for="camp-title">活动标题</label><input class="text-input" id="camp-title" name="title" maxlength="80" value="${C.escapeHtml(draft.title)}" placeholder="例如：小鹿的季度会员礼"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="camp-honoree">主播 / 频道</label><input class="text-input" id="camp-honoree" name="honoree" maxlength="40" value="${C.escapeHtml(draft.honoree)}" placeholder="例如：星野"></div>
        <div class="field"><label for="camp-deadline">登记截止日期</label><input class="text-input" id="camp-deadline" name="deadline" type="date" value="${C.escapeHtml(draft.deadline)}"></div>
      </div>
      <div class="field"><label for="camp-desc">活动说明</label><textarea class="text-input textarea" id="camp-desc" name="description" rows="3" maxlength="500" placeholder="例如：星野直播间季度房管会员礼登记">${C.escapeHtml(draft.description)}</textarea></div>
      <div class="field"><label for="camp-tally">Tally 表单链接（推荐）</label><input class="text-input" id="camp-tally" name="tallyUrl" value="${C.escapeHtml(draft.tallyUrl)}" placeholder="https://tally.so/r/xxxxxx"><p class="field-hint">粘贴 Tally 表单的分享链接或嵌入代码。配置后用户端会直接嵌入 Tally 表单，提交进入 Tally 后台；留空则显示「待开放」，除非你开启下面的离线备用。</p></div>
      <label class="switch-row"><input type="checkbox" id="camp-offline"${draft.allowOffline ? " checked" : ""}> <span>未绑定 Tally 时允许离线资料包（不推荐，用户需要手动发文件）</span></label>
      <label class="switch-row"><input type="checkbox" id="camp-active"${draft.active ? " checked" : ""}> <span>在用户端显示这个会员礼</span></label>
      <div class="example-editor-grid">
        ${exampleEditor("diamond", "钻石消费记录示例图", draft.exampleDiamond)}
        ${exampleEditor("expiry", "会员截止日期示例图", draft.exampleExpiry)}
      </div>
      <p class="field-error" data-error-for="campaign"></p>
      <p class="settings-hint">示例图只用于给用户参考，用户上传的仍必须是自己的真实截图。示例图会包含在导出的 config.js 中。</p>`;
    const footer = document.createElement("div");
    footer.className = "modal-actions";
    footer.innerHTML = `<button class="btn btn-ghost" type="button" data-close-editor>取消</button><button class="btn btn-primary" type="button" data-save-campaign>${existing ? "保存活动" : "创建活动"}</button>`;
    const modal = C.openModal({
      title: existing ? "编辑会员礼活动" : "新增会员礼活动",
      content: form,
      footer,
      wide: true
    });
    if (!modal) return;
    C.$$("[data-example-input]", form).forEach((input) => {
      input.addEventListener("change", async () => {
        const kind = input.getAttribute("data-example-input");
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const result = await C.compressImage(file, { maxDim: 1400, quality: 0.84, maxBytes: 2.4 * 1024 * 1024 });
          draft[kind === "diamond" ? "exampleDiamond" : "exampleExpiry"] = result.dataUrl;
          updateExampleEditor(kind, result.dataUrl, form);
          C.toast("示例图已准备好。", "success");
        } catch (error) {
          C.toast(error.message || "示例图处理失败。", "error");
          input.value = "";
        }
      });
    });
    C.$$("[data-reset-example]", form).forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-reset-example");
        const fallback = kind === "diamond" ? "assets/example-diamond.svg" : "assets/example-expiry.svg";
        draft[kind === "diamond" ? "exampleDiamond" : "exampleExpiry"] = fallback;
        updateExampleEditor(kind, fallback, form);
      });
    });
    footer.querySelector("[data-close-editor]").addEventListener("click", () => modal.close());
    footer.querySelector("[data-save-campaign]").addEventListener("click", async () => {
      const error = form.querySelector("[data-error-for='campaign']");
      error.textContent = "";
      const type = form.querySelector("#camp-type").value.trim();
      const title = form.querySelector("#camp-title").value.trim();
      const rawTally = form.querySelector("#camp-tally").value.trim();
      const tallyUrl = C.normalizeTallyUrl(rawTally);
      if (!type || !title) {
        error.textContent = "会员礼类型和活动标题都不能为空。";
        return;
      }
      if (rawTally && !tallyUrl) {
        error.textContent = "Tally 链接格式不正确。请粘贴 https://tally.so/r/... 形式的分享链接或完整嵌入代码。";
        return;
      }
      try {
        await DB.saveCampaign({
          id: draft.id,
          type,
          title,
          honoree: form.querySelector("#camp-honoree").value.trim(),
          description: form.querySelector("#camp-desc").value.trim(),
          deadline: form.querySelector("#camp-deadline").value,
          tallyUrl,
          allowOffline: form.querySelector("#camp-offline").checked,
          active: form.querySelector("#camp-active").checked,
          exampleDiamond: draft.exampleDiamond,
          exampleExpiry: draft.exampleExpiry
        });
        modal.close();
        await refresh();
        C.toast(existing ? "活动已保存。" : "活动已创建。", "success");
      } catch (err) {
        error.textContent = err.message || "保存失败。";
      }
    });
  }

  function exampleEditor(kind, title, src) {
    return `
      <div class="example-editor" data-example-editor="${kind}">
        <div class="example-editor-head"><strong>${C.escapeHtml(title)}</strong><button class="text-button" type="button" data-reset-example="${kind}">恢复默认</button></div>
        <img src="${C.escapeHtml(C.safeImageSrc(src))}" alt="${C.escapeHtml(title)}" data-example-img="${kind}">
        <label class="btn btn-secondary btn-block example-upload-label" for="example-${kind}">上传 / 替换示例图</label>
        <input class="visually-hidden" id="example-${kind}" data-example-input="${kind}" type="file" accept="image/jpeg,image/png,image/webp">
      </div>`;
  }

  function updateExampleEditor(kind, src, form) {
    const img = form.querySelector(`[data-example-img="${kind}"]`);
    if (img) img.src = C.safeImageSrc(src);
  }

  async function toggleCampaign(id) {
    const campaign = state.campaigns.find((item) => item.id === id);
    if (!campaign) return;
    await DB.saveCampaign({ id, active: !campaign.active });
    await refresh();
    C.toast(campaign.active ? "活动已停用。" : "活动已启用。", "success");
  }

  async function duplicateCampaign(id) {
    const campaign = state.campaigns.find((item) => item.id === id);
    if (!campaign) return;
    const copy = Object.assign({}, campaign, {
      id: "",
      title: `${campaign.title}（副本）`,
      active: false,
      createdAt: undefined,
      updatedAt: undefined
    });
    await DB.saveCampaign(copy);
    await refresh();
    state.tab = "campaigns";
    renderShell();
    C.toast("活动已复制，默认停用。", "success");
  }

  async function deleteCampaign(id) {
    const campaign = state.campaigns.find((item) => item.id === id);
    if (!campaign) return;
    const count = state.submissions.filter((row) => row.campaignId === id).length;
    const message = count
      ? `这个活动已经有 ${count} 份登记记录。删除活动不会删除记录，但用户端将不再显示该活动。`
      : "删除后该活动将从本机移除；访客端的活动列表需要重新导出配置。";
    const confirmed = await C.confirmDialog({
      title: "删除会员礼活动？",
      message,
      confirmText: "删除活动",
      danger: true
    });
    if (!confirmed) return;
    await DB.deleteCampaign(id);
    await refresh();
    C.toast("活动已删除。", "success");
  }

  async function saveSiteSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await DB.saveSiteSettings({
        siteTitle: String(data.get("siteTitle") || ""),
        heroTitle: String(data.get("heroTitle") || ""),
        heroSubtitle: String(data.get("heroSubtitle") || ""),
        publicNotice: String(data.get("publicNotice") || "")
      });
      await loadData();
      renderShell();
      C.toast("标题和文案已保存到本机。", "success");
    } catch (error) {
      C.toast(error.message || "保存失败。", "error");
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const error = C.$("[data-error-for='password']");
    error.textContent = "";
    const current = C.$("#current-password").value;
    const next = C.$("#new-password").value;
    const confirm = C.$("#new-password-confirm").value;
    if (!(await DB.verifyAdminPassword(current))) {
      error.textContent = "当前密码不正确。";
      return;
    }
    if (next.length < 8) {
      error.textContent = "新密码至少需要 8 位。";
      return;
    }
    if (next !== confirm) {
      error.textContent = "两次输入的新密码不一致。";
      return;
    }
    await DB.setAdminPassword(next);
    C.$("#current-password").value = "";
    C.$("#new-password").value = "";
    C.$("#new-password-confirm").value = "";
    C.toast("管理员密码已修改。", "success");
  }

  function configObject() {
    return {
      version: C.nowIso(),
      siteTitle: state.site.siteTitle,
      heroTitle: state.site.heroTitle,
      heroSubtitle: state.site.heroSubtitle,
      publicNotice: state.site.publicNotice,
      campaigns: state.campaigns.map((campaign) => ({
        id: campaign.id,
        type: campaign.type,
        title: campaign.title,
        honoree: campaign.honoree,
        description: campaign.description,
        deadline: campaign.deadline,
        active: Boolean(campaign.active),
        tallyUrl: campaign.tallyUrl || "",
        allowOffline: campaign.allowOffline === true,
        exampleDiamond: campaign.exampleDiamond,
        exampleExpiry: campaign.exampleExpiry
      }))
    };
  }

  function exportSiteConfig() {
    const config = configObject();
    const json = JSON.stringify(config, null, 2)
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    const text = `/* 猫神会员礼系统 · 由管理后台导出的公开配置。替换 js/config.js 后重新部署。 */\nwindow.CATHEN_CONFIG = ${json};\n`;
    C.downloadText("config.js", text, "application/javascript;charset=utf-8");
    const modal = C.openModal({
      title: "config.js 已导出",
      content: `
        <div class="deploy-modal">
          <p>现在把下载的 <code>config.js</code> 替换项目中的 <code>js/config.js</code>，然后提交到 GitHub Pages 仓库：</p>
          <ol><li>用导出的文件覆盖 <code>js/config.js</code>。</li><li><code>git add js/config.js &amp;&amp; git commit &amp;&amp; git push</code></li><li>等待 Pages 构建完成，打开公开链接并按 <kbd>Ctrl</kbd> + <kbd>F5</kbd> 强刷。</li></ol>
          <p class="settings-hint">导出的配置包含活动标题、说明和两张示例图，不包含任何用户收货资料。</p>
        </div>`,
      footer: `<div class="modal-actions"><button class="btn btn-primary" type="button" data-modal-close>知道了</button></div>`
    });
    C.toast("config.js 已下载。", "success");
  }

  async function exportCsv() {
    const rows = filteredSubmissions();
    if (!rows.length) {
      C.toast("当前没有可导出的记录。", "info");
      return;
    }
    const csvCell = (value, formulaGuard) => {
      let text = String(value == null ? "" : value);
      if (formulaGuard && /^[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const header = ["会员礼类型", "活动标题", "主播 / 频道", "手机号", "微信会员群昵称", "抖音昵称", "省份", "城市", "详细地址", "首次保存", "最近修改", "钻石证明", "截止日期证明", "来源"];
    const lines = [header.map((value) => csvCell(value)).join(",")];
    rows.forEach((row) => {
      const cells = [
        csvCell(row.campaignType, true),
        csvCell(row.campaignTitle, true),
        csvCell(row.honoree, true),
        `="${String(row.phone).replace(/"/g, "")}"`,
        csvCell(row.wechat, true),
        csvCell(row.douyin, true),
        csvCell(row.province, true),
        csvCell(row.city, true),
        csvCell(row.addressDetail, true),
        csvCell(C.formatDate(row.createdAt), false),
        csvCell(C.formatDate(row.updatedAt), false),
        csvCell("有", false),
        csvCell("有", false),
        csvCell(row.source === "imported" ? "导入" : "本机", false)
      ];
      lines.push(cells.join(","));
    });
    C.downloadText(`猫神会员礼-登记台账-${C.formatDate(C.nowIso(), false)}.csv`, "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
    C.toast(`已导出 ${rows.length} 条记录。`, "success");
  }

  async function exportBackup() {
    const confirmed = await C.confirmDialog({
      title: "导出完整备份？",
      message: "备份包含全部收货信息、两张证明图片、活动配置和管理员密码哈希。文件属于敏感资料，请保存在加密磁盘，不要公开分享。",
      confirmText: "导出备份"
    });
    if (!confirmed) return;
    const data = await DB.exportAllData();
    C.downloadText(`猫神会员礼-完整备份-${C.formatDate(C.nowIso(), false)}.json`, JSON.stringify(data), "application/json;charset=utf-8");
    C.toast("完整备份已下载。", "success");
  }

  function importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const confirmed = await C.confirmDialog({
        title: "从备份恢复？",
        message: "会替换当前所有活动、示例图和登记记录。当前管理员密码会保留，备份里的管理员密码不会被使用。建议先导出当前备份。",
        confirmText: "恢复备份",
        danger: true
      });
      if (!confirmed) return;
      try {
        const data = JSON.parse(await file.text());
        await DB.importAllData(data, { preserveAdmin: true });
        clearSession();
        C.toast("备份已恢复，请重新登录后台。", "success");
        window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        C.toast(error.message || "备份恢复失败。", "error");
      }
    });
    input.click();
  }

  async function clearAllData() {
    const first = await C.confirmDialog({
      title: "清空本机后台数据？",
      message: "会永久删除本浏览器中的所有活动、示例图和已导入资料。该操作无法撤销，请先导出完整备份。",
      confirmText: "继续",
      danger: true
    });
    if (!first) return;
    const second = await C.confirmDialog({
      title: "最后确认",
      message: "真的要清空全部数据和后台密码吗？清除后需要重新设置管理员密码。",
      confirmText: "永久清空",
      danger: true
    });
    if (!second) return;
    await DB.clearAllData();
    clearSession();
    C.toast("本机后台数据已清空。", "success");
    window.setTimeout(() => window.location.reload(), 700);
  }

  window.addEventListener("beforeunload", () => {
    /* Data is persisted in IndexedDB immediately. */
  });

  boot().catch((error) => {
    console.error(error);
    app.innerHTML = `<section class="admin-auth-page"><div class="admin-auth-card"><h1>后台无法启动</h1><p class="lead">${C.escapeHtml(error.message || "浏览器本地数据库不可用。")}</p><button class="btn btn-primary" type="button" data-reload>重新加载</button></div></section>`;
    const button = C.$("[data-reload]");
    if (button) button.addEventListener("click", () => window.location.reload());
  });
})();
