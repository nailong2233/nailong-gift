/* 猫神会员礼系统 · 用户端 */
(function () {
  "use strict";

  const C = window.Cathen;
  const DB = window.CathenDB;
  const REGIONS = window.CATHEN_REGIONS || {};
  const SESSION_KEY = "catshen_user_session";
  const SESSION_DAYS = 7;

  const state = {
    config: window.CATHEN_CONFIG || {},
    preview: false,
    site: {},
    campaigns: [],
    campaign: null,
    currentSub: null,
    editing: false,
    lastCode: "",
    uploads: { diamond: null, expiry: null },
    justUpdated: false
  };

  const app = C.$("#app");

  function safeSessionGet() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function safeSessionSet(value) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch (error) {
      /* private mode */
    }
  }

  function safeSessionClear() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  function setUserSession(submission) {
    safeSessionSet({
      key: submission.key,
      campaignId: submission.campaignId,
      phone: submission.phone,
      expiresAt: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    });
  }

  function getValidSession() {
    const session = safeSessionGet();
    if (!session || !session.key || Number(session.expiresAt || 0) < Date.now()) {
      safeSessionClear();
      return null;
    }
    return session;
  }

  function previewSuffix() {
    return state.preview ? "&preview=1" : "";
  }

  function homeUrl() {
    return `index.html?home=1${previewSuffix()}`;
  }

  function campaignUrl(id) {
    return `index.html?gift=${encodeURIComponent(id)}${previewSuffix()}`;
  }

  function dashboardUrl() {
    return `index.html${state.preview ? "?preview=1" : ""}`;
  }

  function lookupUrl() {
    return `index.html?lookup=1${previewSuffix()}#lookup`;
  }

  function applyChrome() {
    const site = state.site || {};
    const title = site.siteTitle || state.config.siteTitle || "猫神会员礼系统";
    C.$$("[data-site-title]").forEach((node) => {
      node.textContent = title;
    });
    document.title = title;
    const home = homeUrl();
    const brand = C.$(".brand");
    if (brand) brand.href = home;
    const links = C.$$(".main-nav a");
    if (links[0]) links[0].href = home;
    if (links[1]) links[1].href = `index.html?lookup=1${previewSuffix()}#lookup`;
    C.$$("[data-public-notice]").forEach((node) => {
      node.textContent = site.publicNotice || state.config.publicNotice || "";
    });
    if (state.preview) {
      const strip = C.$(".top-strip p");
      if (strip) strip.textContent = "本地预览模式 · 当前显示的是你尚未导出的本机设置；发布后访客才能看到";
      document.body.classList.add("is-preview");
    }
  }

  function defaultSite() {
    return {
      siteTitle: state.config.siteTitle || "猫神会员礼系统",
      heroTitle: state.config.heroTitle || "替主播，把每一份|会员礼登记清楚。",
      heroSubtitle: state.config.heroSubtitle || "",
      publicNotice: state.config.publicNotice || ""
    };
  }

  async function loadCampaigns() {
    if (!state.preview) {
      return DB.configCampaigns().filter((campaign) => campaign.active);
    }
    await DB.ensureAdminCampaigns();
    const local = await DB.listCampaigns(true);
    return local.length ? local : DB.configCampaigns();
  }

  async function boot() {
    state.preview = C.getQueryParam("preview") === "1";
    if (state.preview) {
      try {
        state.site = await DB.getSiteSettings();
      } catch (error) {
        state.site = defaultSite();
      }
    } else {
      state.site = defaultSite();
    }
    state.campaigns = await loadCampaigns();
    applyChrome();
    await restoreSession();
    await route();
  }

  async function restoreSession() {
    const session = getValidSession();
    if (!session) return;
    try {
      const submission = await DB.getSubmission(session.key);
      if (submission) state.currentSub = submission;
      else safeSessionClear();
    } catch (error) {
      state.currentSub = null;
    }
  }

  async function route() {
    const giftId = C.getQueryParam("gift");
    const forceHome = C.getQueryParam("home") === "1" || C.getQueryParam("lookup") === "1";
    const hash = window.location.hash;

    if (giftId) {
      const campaign = state.campaigns.find((item) => item.id === giftId);
      if (!campaign || (!campaign.active && !state.preview)) {
        renderNotFound();
        return;
      }
      if (state.currentSub && state.currentSub.campaignId === giftId) {
        renderDashboard();
      } else {
        renderForm(campaign);
      }
      return;
    }

    if (hash === "#lookup" || C.getQueryParam("lookup") === "1") {
      if (state.currentSub) renderDashboard();
      else renderLogin();
      return;
    }

    if (forceHome) {
      renderLanding();
      return;
    }

    if (state.currentSub) {
      renderDashboard();
      return;
    }

    renderLanding();
  }

  function setTitle(title) {
    const siteTitle = state.site.siteTitle || state.config.siteTitle || "猫神会员礼系统";
    document.title = title ? `${title} · ${siteTitle}` : siteTitle;
  }

  function renderLanding() {
    setTitle("");
    const site = state.site;
    const active = state.campaigns.filter((campaign) => campaign.active);
    const usesTally = active.some((campaign) => C.normalizeTallyUrl(campaign.tallyUrl));
    const hasOffline = active.some((campaign) => campaign.allowOffline);
    const lastStep = usesTally
      ? `<article><span>04</span><h3>提交到 Tally 后台</h3><p>提交后资料直接进入管理员的 Tally 后台，不需要再发文件。</p></article>`
      : hasOffline
        ? `<article><span>04</span><h3>下载资料包发给管理员</h3><p>离线备用模式不会自动上传，下载后发送给管理员才会被收件。</p></article>`
        : `<article><span>04</span><h3>等待管理员开放</h3><p>在线表单尚未配置，请联系管理员后再提交。</p></article>`;
    const privacyLine = usesTally
      ? "Tally 在线表单 · 提交后直接进入管理员后台"
      : hasOffline
        ? "离线备用模式 · 资料保存在你的浏览器"
        : "在线表单待管理员配置 · 请稍后再来";
    const lookupButtonLabel = usesTally ? "查询旧版离线资料" : "查询我的登记";
    const lookupTitle = usesTally ? "之前下载过离线资料包？" : "已经登记过？";
    const lookupCopy = usesTally
      ? "Tally 在线提交不在本页查询；这里只用于旧版离线资料包记录。需要修改 Tally 资料请联系管理员。"
      : "用手机号 + 查询码查看自己的资料，或修改后重新下载资料包发给管理员。";
    const previewBanner = state.preview
      ? `<div class="preview-banner"><strong>本地预览</strong><span>这里显示的是本机未发布的设置。导出并部署 <code>js/config.js</code> 后，访客才会看到相同内容。</span></div>`
      : "";
    const loggedInBanner = state.currentSub
      ? `<div class="signed-in-banner"><span>你已登录，当前查看的是「${C.escapeHtml(state.currentSub.campaignTitle)}」。</span><a href="${dashboardUrl()}">查看我的资料 →</a></div>`
      : "";
    const heroExamples = active[0]
      ? `<div class="hero-example-stack">
          <figure class="hero-example hero-example-a"><img src="${C.escapeHtml(C.safeImageSrc(active[0].exampleDiamond))}" alt="钻石消费记录示例"><figcaption>钻石消费记录</figcaption></figure>
          <figure class="hero-example hero-example-b"><img src="${C.escapeHtml(C.safeImageSrc(active[0].exampleExpiry))}" alt="会员截止日期记录示例"><figcaption>会员截止日期记录</figcaption></figure>
          <span class="hero-stamp">两张证明<br><strong>缺一不可</strong></span>
        </div>`
      : `<div class="hero-cat" aria-hidden="true"><span class="cat-face"><i></i><i></i><b></b></span><p>CAT GOD<br>MEMBER GIFTS</p></div>`;

    const heroTitleText = site.heroTitle || "替主播，把每一份|会员礼登记清楚。";
    const heroTitleClass = heroTitleText.replace(/\|/g, "").length > 12 ? " is-long" : "";
    const heroTitleHtml = C.escapeHtml(heroTitleText).replace(/\|/g, "<br>");
    app.innerHTML = `
      ${previewBanner}
      <section class="landing-hero">
        <div class="landing-copy">
          <p class="eyebrow"><span></span> STREAMER GIFT REGISTRY</p>
          <h1 class="${heroTitleClass}">${heroTitleHtml}</h1>
          <p class="lead">${C.escapeHtml(site.heroSubtitle || "")}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#gifts">查看会员礼 <span class="btn-arrow">↓</span></a>
            <a class="btn btn-ghost" href="index.html?lookup=1${previewSuffix()}#lookup">${C.escapeHtml(lookupButtonLabel)}</a>
          </div>
          <div class="privacy-inline"><span class="privacy-dot"></span> ${C.escapeHtml(privacyLine)}</div>
        </div>
        ${heroExamples}
      </section>

      ${loggedInBanner}
      <div class="notice-banner" data-public-notice>${C.escapeHtml(site.publicNotice || "")}</div>

      <section class="gifts-section" id="gifts">
        <div class="section-head">
          <div>
            <p class="eyebrow"><span></span> CURRENT GIFTS</p>
            <h2>正在登记的会员礼</h2>
          </div>
          <p class="section-note">每个主播的会员礼独立收集，可同时登记多个主播的季度礼、月度礼。请先确认主播 / 频道，再填写资料。</p>
        </div>
        ${active.length ? `<div class="campaign-grid">${active.map(campaignCard).join("")}</div>` : emptyCampaigns()}
      </section>

      <section class="how-section">
        <div class="section-head">
          <div>
            <p class="eyebrow"><span></span> HOW IT WORKS</p>
            <h2>四步完成登记</h2>
          </div>
        </div>
        <div class="step-grid">
          <article><span>01</span><h3>选择主播的会员礼</h3><p>确认主播 / 频道和会员礼类型，避免登记到错误的活动。</p></article>
          <article><span>02</span><h3>填写收货信息</h3><p>手机号需 11 位；地址必须详细到省市和街道门牌。</p></article>
          <article><span>03</span><h3>上传两张证明</h3><p>钻石消费记录 + 会员截止日期记录，两张都必须上传。</p></article>
          ${lastStep}
        </div>
      </section>

      <section class="lookup-strip" id="lookup">
        <div>
          <p class="eyebrow"><span></span> MEMBER ACCESS</p>
          <h2>${C.escapeHtml(lookupTitle)}</h2>
          <p>${C.escapeHtml(lookupCopy)}</p>
        </div>
        <a class="btn btn-secondary" href="index.html?lookup=1${previewSuffix()}#lookup">${C.escapeHtml(lookupButtonLabel)} <span class="btn-arrow">→</span></a>
      </section>
    `;
  }

  function emptyCampaigns() {
    return `<div class="empty-panel"><span class="paw-mark">✦</span><h3>暂时没有进行中的会员礼</h3><p>请稍后再来，或联系管理员确认活动是否已开启。</p></div>`;
  }

  function campaignCard(campaign) {
    const deadline = campaign.deadline
      ? `<span class="campaign-deadline">截止 ${C.escapeHtml(C.formatDeadline(campaign.deadline))}</span>`
      : `<span class="campaign-deadline">长期有效</span>`;
    const ready = Boolean(campaign.tallyUrl) || Boolean(campaign.allowOffline);
    const modePill = campaign.tallyUrl
      ? '<span class="tally-pill">Tally 在线</span>'
      : campaign.allowOffline
        ? '<span class="tally-pill is-offline">离线备用</span>'
        : '<span class="tally-pill is-offline">待配置</span>';
    return `
      <article class="campaign-card">
        <div class="campaign-top">
          <div class="campaign-tags"><span class="type-pill">${C.escapeHtml(campaign.type)}</span>${modePill}</div>
          ${deadline}
        </div>
        <div class="campaign-heading">
          <h3>${C.escapeHtml(campaign.title)}</h3>
          ${campaign.honoree ? `<p class="honoree">主播 / 频道 · ${C.escapeHtml(campaign.honoree)}</p>` : ""}
        </div>
        <p class="campaign-desc">${C.escapeHtml(campaign.description || "请填写收货信息，并上传两张会员证明截图。")}</p>
        <div class="mini-examples">
          <figure><img loading="lazy" src="${C.escapeHtml(C.safeImageSrc(campaign.exampleDiamond))}" alt="钻石消费记录示例"><figcaption>钻石消费记录</figcaption></figure>
          <figure><img loading="lazy" src="${C.escapeHtml(C.safeImageSrc(campaign.exampleExpiry))}" alt="会员截止日期记录示例"><figcaption>会员截止日期</figcaption></figure>
        </div>
        <a class="card-link" href="${campaignUrl(campaign.id)}">${ready ? "填写这份会员礼" : "查看开放状态"} <span aria-hidden="true">→</span></a>
      </article>`;
  }

  function renderForm(campaign, submission) {
    state.campaign = campaign;
    state.editing = Boolean(submission);
    const tallyEmbed = C.tallyEmbedUrl(campaign.tallyUrl, campaign);
    if (tallyEmbed && !state.editing) {
      renderTallyForm(campaign, tallyEmbed);
      return;
    }
    if (!tallyEmbed && !campaign.allowOffline && !state.editing) {
      renderUnavailable(campaign);
      return;
    }
    state.justUpdated = false;
    state.currentSub = submission || state.currentSub;
    state.uploads.diamond = submission
      ? { dataUrl: submission.diamondImage, bytes: null, existing: true }
      : null;
    state.uploads.expiry = submission
      ? { dataUrl: submission.expiryImage, bytes: null, existing: true }
      : null;
    setTitle(state.editing ? "修改资料" : campaign.title);
    const site = state.site;
    const values = submission || {
      phone: "",
      wechat: "",
      douyin: "",
      province: "",
      city: "",
      addressDetail: ""
    };
    const backHref = state.editing ? lookupUrl() : homeUrl();
    const backText = state.editing ? "返回我的资料" : "返回会员礼列表";
    const deadline = campaign.deadline ? `截止 ${C.formatDeadline(campaign.deadline)}` : "长期有效";
    app.innerHTML = `
      ${state.preview ? `<div class="preview-banner"><strong>本地预览</strong><span>你正在预览本机活动设置。发布前用户看不到这些内容。</span></div>` : ""}
      <section class="form-page">
        <a class="back-link" href="${backHref}">← ${backText}</a>
        <header class="form-campaign-head">
          <div>
            <div class="campaign-top"><span class="type-pill">${C.escapeHtml(campaign.type)}</span><span class="campaign-deadline">${C.escapeHtml(deadline)}</span></div>
            <h1>${C.escapeHtml(state.editing ? "修改我的资料" : campaign.title)}</h1>
            <p>${C.escapeHtml(campaign.description || "请提交两张能看清对应信息的会员证明截图。")}</p>
            ${campaign.honoree ? `<p class="form-honoree">主播 / 频道 · ${C.escapeHtml(campaign.honoree)}</p>` : ""}
          </div>
          ${state.editing ? `<span class="edit-badge">正在修改</span>` : ""}
        </header>

        <div class="privacy-note">
          <span class="privacy-icon">◇</span>
          <div><strong>资料只保存在你的浏览器中</strong><p>${C.escapeHtml(site.publicNotice || "提交后请下载资料包发送给管理员；管理员导入后才会收到你的信息。")}</p></div>
        </div>

        <div class="form-panel">
          <div class="form-alert-slot" data-form-alert></div>
          <form data-register-form novalidate>
            <fieldset class="form-section">
              <legend><span class="legend-index">01</span>收货信息</legend>
              <div class="field">
                <label for="phone">收件人手机号 <em>*</em></label>
                <div class="input-with-suffix">
                  <input class="text-input" id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="13" placeholder="请输入 11 位手机号" value="${C.escapeHtml(values.phone)}">
                  <span class="input-suffix" data-phone-count>0 / 11</span>
                </div>
                <p class="field-hint">用于核对身份与寄送联系。</p>
                <p class="field-error" data-error-for="phone"></p>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="province">省份 / 直辖市 <em>*</em></label>
                  <select class="text-input select-input" id="province" name="province">
                    <option value="">请选择省份</option>
                    ${Object.keys(REGIONS).map((province) => `<option value="${C.escapeHtml(province)}"${province === values.province ? " selected" : ""}>${C.escapeHtml(province)}</option>`).join("")}
                  </select>
                  <p class="field-error" data-error-for="province"></p>
                </div>
                <div class="field">
                  <label for="city">城市 <em>*</em></label>
                  <select class="text-input select-input" id="city" name="city">
                    <option value="">请先选择省份</option>
                  </select>
                  <p class="field-error" data-error-for="city"></p>
                </div>
              </div>
              <div class="field">
                <label for="addressDetail">详细地址 <em>*</em></label>
                <textarea class="text-input textarea" id="addressDetail" name="addressDetail" rows="3" maxlength="120" placeholder="请填写街道、小区、楼栋、门牌号（至少 4 个字）">${C.escapeHtml(values.addressDetail)}</textarea>
                <p class="field-hint">地址必须详细到省市、街道和门牌号，仅填写城市无法寄送。</p>
                <p class="field-error" data-error-for="addressDetail"></p>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><span class="legend-index">02</span>会员身份</legend>
              <div class="field-grid">
                <div class="field">
                  <label for="wechat">微信会员群昵称 <em>*</em></label>
                  <input class="text-input" id="wechat" name="wechat" type="text" maxlength="60" autocomplete="nickname" placeholder="例如：小鹿 · 上海" value="${C.escapeHtml(values.wechat)}">
                  <p class="field-hint">请填写你在会员群里的完整昵称。</p>
                  <p class="field-error" data-error-for="wechat"></p>
                </div>
                <div class="field">
                  <label for="douyin">抖音昵称 <em>*</em></label>
                  <input class="text-input" id="douyin" name="douyin" type="text" maxlength="60" placeholder="例如：小鹿同学" value="${C.escapeHtml(values.douyin)}">
                  <p class="field-hint">用于与会员证明、群身份互相核对。</p>
                  <p class="field-error" data-error-for="douyin"></p>
                </div>
              </div>
            </fieldset>

            <fieldset class="form-section">
              <legend><span class="legend-index">03</span>两张会员证明</legend>
              <div class="example-pair">
                ${exampleCard(campaign, "diamond", "钻石消费记录", "请上传能看清消费明细、日期和钻石数量的截图。")}
                ${exampleCard(campaign, "expiry", "会员截止日期记录", "请上传能看清会员有效期 / 截止日期的截图。")}
              </div>
              <div class="upload-grid">
                ${uploadCard("diamond", "钻石消费记录", "消费明细、日期、钻石数量", submission ? submission.diamondImage : "")}
                ${uploadCard("expiry", "会员截止日期记录", "会员有效期、到期时间", submission ? submission.expiryImage : "")}
              </div>
            </fieldset>

            <label class="consent-row">
              <input type="checkbox" name="consent" value="1"${submission ? " checked" : ""}>
              <span>我确认以上资料真实有效，并同意将其仅用于本次会员礼核验与寄送。</span>
            </label>
            <p class="field-error" data-error-for="consent"></p>

            <div class="submit-row">
              <button class="btn btn-primary btn-submit" type="submit" data-submit>
                <span data-submit-label>${state.editing ? "保存修改" : "保存并生成资料包"}</span><span class="btn-arrow">→</span>
              </button>
              <p class="submit-note">${state.editing ? "保存后请重新下载资料包发给管理员。" : "保存后请下载资料包发给管理员，管理员才会收到。"}</p>
            </div>
          </form>
        </div>
      </section>
    `;

    setupCitySelect(values.province, values.city);
    setupFormInteractions(campaign, submission);
    updatePhoneCount();
    updateUploadUI("diamond");
    updateUploadUI("expiry");
    C.$$("[data-show-example]").forEach((button) => {
      button.addEventListener("click", () => showExample(campaign, button.getAttribute("data-show-example")));
    });
  }

  function renderUnavailable(campaign) {
    setTitle(campaign.title);
    app.innerHTML = `
      <section class="form-page">
        <a class="back-link" href="${homeUrl()}">← 返回会员礼列表</a>
        <header class="form-campaign-head">
          <div>
            <div class="campaign-top"><span class="type-pill">${C.escapeHtml(campaign.type)}</span><span class="campaign-deadline">待开放</span></div>
            <h1>${C.escapeHtml(campaign.title)}</h1>
            <p>${C.escapeHtml(campaign.description || "")}</p>
            ${campaign.honoree ? `<p class="form-honoree">主播 / 频道 · ${C.escapeHtml(campaign.honoree)}</p>` : ""}
          </div>
        </header>
        <div class="empty-panel offline-disabled-panel">
          <span class="paw-mark">✦</span>
          <h3>本次会员礼的在线表单尚未开放</h3>
          <p>管理员还没有绑定 Tally 表单，也没有启用离线资料包。请联系管理员确认登记时间，避免提交到错误的地方。</p>
          <a class="btn btn-secondary" href="${homeUrl()}">看看其他会员礼</a>
        </div>
      </section>`;
  }

  function renderTallyForm(campaign, embedUrl) {
    setTitle(campaign.title);
    const publicUrl = C.tallyPublicUrl(campaign.tallyUrl);
    const deadline = campaign.deadline ? `截止 ${C.formatDeadline(campaign.deadline)}` : "长期有效";
    app.innerHTML = `
      <section class="form-page tally-form-page">
        <a class="back-link" href="${homeUrl()}">← 返回会员礼列表</a>
        <header class="form-campaign-head">
          <div>
            <div class="campaign-top"><span class="type-pill">${C.escapeHtml(campaign.type)}</span><span class="campaign-deadline">${C.escapeHtml(deadline)}</span></div>
            <h1>${C.escapeHtml(campaign.title)}</h1>
            <p>${C.escapeHtml(campaign.description || "请提交两张能看清对应信息的会员证明截图。")}</p>
            ${campaign.honoree ? `<p class="form-honoree">主播 / 频道 · ${C.escapeHtml(campaign.honoree)}</p>` : ""}
          </div>
          <span class="tally-pill large">Tally 在线收集</span>
        </header>

        <div class="example-pair">
          ${exampleCard(campaign, "diamond", "钻石消费记录", "请上传能看清消费明细、日期和钻石数量的截图。")}
          ${exampleCard(campaign, "expiry", "会员截止日期记录", "请上传能看清会员有效期 / 截止日期的截图。")}
        </div>

        <div class="tally-panel">
          <div class="tally-panel-head">
            <div><strong>由 Tally 安全收集</strong><p>提交后资料直接进入管理员的 Tally 后台，本页面不保存你的资料。</p></div>
            <a class="text-link small" href="${C.escapeHtml(publicUrl)}" target="_blank" rel="noopener">新窗口打开 ↗</a>
          </div>
          <div class="tally-frame-wrap">
            <iframe
              src="${C.escapeHtml(embedUrl)}"
              title="${C.escapeHtml(campaign.title)} · Tally 登记表单"
              loading="lazy"
              referrerpolicy="no-referrer"
              allow="clipboard-write"></iframe>
          </div>
          <p class="tally-footnote">表单加载可能需要几秒。两张证明图片建议使用清晰截图，单张不超过 10MB。提交后如需修改，请联系管理员处理。</p>
        </div>
      </section>`;
    C.$$("[data-show-example]").forEach((button) => {
      button.addEventListener("click", () => showExample(campaign, button.getAttribute("data-show-example")));
    });
  }

  function exampleCard(campaign, kind, title, copy) {
    const src = kind === "diamond" ? campaign.exampleDiamond : campaign.exampleExpiry;
    return `
      <article class="example-card">
        <button class="example-image" type="button" data-show-example="${kind}" aria-label="查看${title}示例大图">
          <img src="${C.escapeHtml(C.safeImageSrc(src))}" alt="${C.escapeHtml(title)}示例">
          <span>点击看大图</span>
        </button>
        <div><h3>${C.escapeHtml(title)}</h3><p>${C.escapeHtml(copy)}</p><button type="button" class="text-button" data-show-example="${kind}">查看示例 ↗</button></div>
      </article>`;
  }

  function uploadCard(kind, title, hint, existing) {
    return `
      <div class="upload-card" data-upload-card="${kind}">
        <div class="upload-head"><div><span class="upload-index">${kind === "diamond" ? "A" : "B"}</span><h3>${C.escapeHtml(title)} <em>*</em></h3><p>${C.escapeHtml(hint)}</p></div></div>
        <input class="visually-hidden" type="file" id="${kind}-input" accept="image/jpeg,image/png,image/webp" data-file-input="${kind}">
        <div class="upload-box" data-upload-box="${kind}">
          <label class="upload-empty" for="${kind}-input" data-upload-empty="${kind}">
            <span class="upload-icon" aria-hidden="true">↑</span>
            <strong>点击选择，或拖拽图片到这里</strong>
            <small>JPG / PNG / WebP · 自动压缩 · 原图不超过 15MB</small>
          </label>
          <div class="upload-preview" data-upload-preview="${kind}"${existing ? "" : " hidden"}>
            <img alt="${C.escapeHtml(title)}预览" data-upload-img="${kind}"${existing ? ` src="${C.escapeHtml(existing)}"` : ""}>
            <div class="upload-preview-meta"><span data-upload-meta="${kind}">${existing ? "已上传，重新选择可替换" : ""}</span><button type="button" class="text-button" data-remove-upload="${kind}">重新选择</button></div>
          </div>
        </div>
        <p class="field-hint">示例图仅供参考，请上传你自己的真实截图。</p>
        <p class="field-error" data-error-for="upload-${kind}"></p>
      </div>`;
  }

  function setupCitySelect(provinceValue, cityValue) {
    const province = C.$("#province");
    const city = C.$("#city");
    if (!province || !city) return;
    const fill = (selected) => {
      const cities = REGIONS[province.value] || [];
      city.innerHTML = `<option value="">${province.value ? "请选择城市" : "请先选择省份"}</option>` +
        cities.map((name) => `<option value="${C.escapeHtml(name)}"${name === selected ? " selected" : ""}>${C.escapeHtml(name)}</option>`).join("");
      city.disabled = !province.value;
    };
    fill(cityValue || "");
    province.addEventListener("change", () => {
      fill("");
      clearError("province");
      clearError("city");
    });
    city.addEventListener("change", () => clearError("city"));
  }

  function setupFormInteractions(campaign, submission) {
    const form = C.$("[data-register-form]");
    const phone = C.$("#phone");
    if (!form) return;
    phone.addEventListener("input", () => {
      updatePhoneCount();
      if (phone.value) clearError("phone");
    });
    phone.addEventListener("blur", () => {
      const digits = (phone.value.match(/\d/g) || []).length;
      if (phone.value && digits !== 11) {
        setError("phone", `手机号必须为 11 位数字，当前填写了 ${digits} 位。`);
      }
    });

    C.$$("[data-file-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const kind = input.getAttribute("data-file-input");
        handleUpload(kind, input.files && input.files[0]);
      });
    });
    C.$$("[data-remove-upload]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-remove-upload");
        state.uploads[kind] = null;
        const input = C.$(`[data-file-input="${kind}"]`);
        if (input) input.value = "";
        updateUploadUI(kind);
      });
    });
    C.$$("[data-upload-box]").forEach((box) => {
      const kind = box.getAttribute("data-upload-box");
      ["dragenter", "dragover"].forEach((eventName) =>
        box.addEventListener(eventName, (event) => {
          event.preventDefault();
          box.classList.add("is-dragging");
        })
      );
      ["dragleave", "drop"].forEach((eventName) =>
        box.addEventListener(eventName, (event) => {
          event.preventDefault();
          box.classList.remove("is-dragging");
        })
      );
      box.addEventListener("drop", (event) => {
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) {
          const input = C.$(`[data-file-input="${kind}"]`);
          try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
          } catch (error) {
            /* browsers without DataTransfer still support normal file input */
          }
          handleUpload(kind, file);
        }
      });
    });

    form.addEventListener("input", (event) => {
      if (event.target && event.target.name) clearError(event.target.name);
    });
    form.addEventListener("change", (event) => {
      if (event.target && event.target.name) clearError(event.target.name);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitForm(form, campaign, submission);
    });
  }

  function updatePhoneCount() {
    const phone = C.$("#phone");
    const counter = C.$("[data-phone-count]");
    if (!phone || !counter) return;
    const digits = (phone.value.match(/\d/g) || []).length;
    counter.textContent = `${digits} / 11`;
    counter.classList.toggle("is-warning", digits > 0 && digits !== 11);
  }

  async function handleUpload(kind, file) {
    if (!file) return;
    const card = C.$(`[data-upload-card="${kind}"]`);
    if (card) card.classList.add("is-processing");
    setError(`upload-${kind}`, "");
    try {
      const result = await C.compressImage(file, { maxDim: 1600, quality: 0.86, maxBytes: 3.2 * 1024 * 1024 });
      state.uploads[kind] = { dataUrl: result.dataUrl, bytes: result.bytes, existing: false };
      updateUploadUI(kind);
      C.toast("图片已压缩并准备好。", "success");
    } catch (error) {
      setError(`upload-${kind}`, error.message || "图片处理失败。");
      const input = C.$(`[data-file-input="${kind}"]`);
      if (input) input.value = "";
      state.uploads[kind] = null;
      updateUploadUI(kind);
    } finally {
      if (card) card.classList.remove("is-processing");
    }
  }

  function updateUploadUI(kind) {
    const upload = state.uploads[kind];
    const empty = C.$(`[data-upload-empty="${kind}"]`);
    const preview = C.$(`[data-upload-preview="${kind}"]`);
    const image = C.$(`[data-upload-img="${kind}"]`);
    const meta = C.$(`[data-upload-meta="${kind}"]`);
    if (!empty || !preview) return;
    if (upload && upload.dataUrl) {
      empty.hidden = true;
      preview.hidden = false;
      if (image) image.src = upload.dataUrl;
      if (meta) meta.textContent = upload.bytes ? `已压缩 · ${C.formatBytes(upload.bytes)}` : "当前已上传，重新选择可替换";
    } else {
      empty.hidden = false;
      preview.hidden = true;
      if (image) image.removeAttribute("src");
    }
  }

  function showExample(campaign, kind) {
    const src = kind === "diamond" ? campaign.exampleDiamond : campaign.exampleExpiry;
    const title = kind === "diamond" ? "钻石消费记录 · 示例" : "会员截止日期记录 · 示例";
    C.openModal({
      title,
      content: `<figure class="modal-example"><img src="${C.escapeHtml(C.safeImageSrc(src))}" alt="${C.escapeHtml(title)}"><figcaption>示例图仅用于说明需要展示的信息；请上传你自己的真实截图，并确保文字清晰完整。</figcaption></figure>`,
      wide: true
    });
  }

  function setError(name, message) {
    const node = C.$(`[data-error-for="${name}"]`);
    if (node) node.textContent = message || "";
    const input = C.$(`[name="${name}"]`) || C.$(`#${name}`);
    if (input) {
      input.classList.toggle("is-invalid", Boolean(message));
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (name === "consent") {
      const row = C.$(".consent-row");
      if (row) row.classList.toggle("is-invalid", Boolean(message));
    }
  }

  function clearError(name) {
    setError(name, "");
  }

  function clearAllErrors() {
    C.$$("[data-error-for]").forEach((node) => {
      node.textContent = "";
    });
    C.$$(".is-invalid").forEach((node) => node.classList.remove("is-invalid"));
    const alert = C.$("[data-form-alert]");
    if (alert) alert.innerHTML = "";
  }

  function validateForm(campaign) {
    const errors = [];
    const phone = C.normalizePhone(C.$("#phone").value);
    if (!C.isValidPhone(phone)) {
      setError("phone", "请填写有效的 11 位中国大陆手机号。");
      errors.push("phone");
    }
    const province = C.$("#province").value;
    const city = C.$("#city").value;
    if (!province || !REGIONS[province]) {
      setError("province", "请选择省份，地址必须详细到省市。");
      errors.push("province");
    }
    if (!city) {
      setError("city", "请选择城市，地址必须详细到省市。");
      errors.push("city");
    } else if ((REGIONS[province] || []).indexOf(city) === -1) {
      setError("city", "城市与省份不匹配，请重新选择。");
      errors.push("city");
    }
    const detail = C.$("#addressDetail").value.replace(/\s+/g, " ").trim();
    if (detail.length < 4) {
      setError("addressDetail", "详细地址至少需要 4 个字，请补充街道和门牌号。");
      errors.push("addressDetail");
    }
    const wechat = C.$("#wechat").value.trim();
    const douyin = C.$("#douyin").value.trim();
    if (!wechat) {
      setError("wechat", "请填写微信会员群昵称。");
      errors.push("wechat");
    }
    if (!douyin) {
      setError("douyin", "请填写抖音昵称。");
      errors.push("douyin");
    }
    if (!state.uploads.diamond || !state.uploads.diamond.dataUrl) {
      setError("upload-diamond", "请上传钻石消费记录截图。");
      errors.push("diamond");
    }
    if (!state.uploads.expiry || !state.uploads.expiry.dataUrl) {
      setError("upload-expiry", "请上传会员截止日期记录截图。");
      errors.push("expiry");
    }
    if (!C.$('input[name="consent"]').checked) {
      setError("consent", "请勾选同意后再提交。");
      errors.push("consent");
    }
    return { phone, province, city, detail, wechat, douyin, errors };
  }

  function showFormAlert(message, extraHtml) {
    const slot = C.$("[data-form-alert]");
    if (!slot) return;
    slot.innerHTML = `<div class="form-alert" role="alert"><strong>未能保存</strong><p>${C.escapeHtml(message)}</p>${extraHtml || ""}</div>`;
    slot.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submitForm(form, campaign, existingSubmission) {
    clearAllErrors();
    const values = validateForm(campaign);
    if (values.errors.length) {
      const first = C.$(`[data-error-for="${values.errors[0]}"]`) || C.$(".form-alert-slot");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      C.toast("还有项目需要修正。", "error");
      return;
    }
    const button = C.$("[data-submit]");
    const label = C.$("[data-submit-label]");
    if (button) button.disabled = true;
    if (label) label.textContent = state.editing ? "正在保存…" : "正在生成资料包…";
    try {
      const key = DB.submissionKey(campaign.id, values.phone);
      const duplicate = await DB.getSubmission(key);
      if (duplicate && (!existingSubmission || duplicate.key !== existingSubmission.key)) {
        setError("phone", "这个手机号已经登记过本活动，请直接查询 / 修改，不要重复提交。");
        showFormAlert(
          "这个手机号已经登记过本活动。",
          `<p class="form-alert-action"><a class="text-link" href="index.html?lookup=1${previewSuffix()}#lookup">去查询 / 修改我的资料 →</a></p>`
        );
        return;
      }
      const now = C.nowIso();
      let saved;
      if (existingSubmission) {
        const patch = {
          campaignId: campaign.id,
          campaignType: campaign.type,
          campaignTitle: campaign.title,
          honoree: campaign.honoree || "",
          phone: values.phone,
          wechat: values.wechat,
          douyin: values.douyin,
          province: values.province,
          city: values.city,
          addressDetail: values.detail,
          diamondImage: state.uploads.diamond.dataUrl,
          expiryImage: state.uploads.expiry.dataUrl
        };
        saved = await DB.updateSubmission(existingSubmission.key, patch);
        state.currentSub = saved;
        setUserSession(saved);
        state.justUpdated = true;
        renderDashboard();
        C.toast("修改已保存，请重新下载资料包发给管理员。", "success");
        return;
      }
      const code = C.generateQueryCode();
      const salt = C.randomSaltHex();
      const hash = await C.hashSecret(C.normalizeCode(code), salt, C.QUERY_ITERATIONS);
      saved = await DB.saveSubmission({
        key,
        campaignId: campaign.id,
        campaignType: campaign.type,
        campaignTitle: campaign.title,
        honoree: campaign.honoree || "",
        phone: values.phone,
        wechat: values.wechat,
        douyin: values.douyin,
        province: values.province,
        city: values.city,
        addressDetail: values.detail,
        diamondImage: state.uploads.diamond.dataUrl,
        expiryImage: state.uploads.expiry.dataUrl,
        accessSalt: salt,
        accessHash: hash,
        accessIterations: C.QUERY_ITERATIONS,
        createdAt: now,
        updatedAt: now,
        source: "local"
      });
      state.currentSub = saved;
      state.lastCode = code;
      setUserSession(saved);
      renderSuccess(saved, code);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      showFormAlert(error.message || "保存失败，请稍后重试。");
    } finally {
      if (button) button.disabled = false;
      if (label) label.textContent = state.editing ? "保存修改" : "保存并生成资料包";
    }
  }

  function renderSuccess(submission, code) {
    setTitle("登记成功");
    app.innerHTML = `
      <section class="success-page">
        <div class="success-mark">✓</div>
        <p class="eyebrow"><span></span> SAVED LOCALLY</p>
        <h1>资料已保存到你的浏览器</h1>
        <p class="lead">还差一步：请下载资料包，并通过微信 / 邮件发给管理员。管理员导入后才会收到你的会员礼申请。</p>

        <div class="code-panel">
          <div class="code-head"><span>你的专属查询码</span><small>只显示这一次，请立即保存</small></div>
          <div class="code-row"><code>${C.escapeHtml(code)}</code><button class="btn btn-code" type="button" data-copy-code="${C.escapeHtml(code)}">复制查询码</button></div>
          <p>以后在本浏览器查看或修改资料时需要：<strong>手机号 + 查询码</strong>。如果查询码遗失，资料包仍可作为备份交给管理员。</p>
        </div>

        <div class="package-callout">
          <div><span class="package-icon">↓</span><div><strong>下载资料包并发给管理员</strong><p>资料包包含你的收货信息和两张证明截图。离线备用模式不会自动上传。</p></div></div>
          <div class="package-actions">
            <button class="btn btn-primary" type="button" data-download-package>下载资料包</button>
            <button class="btn btn-ghost" type="button" data-share-package>分享给管理员</button>
          </div>
        </div>

        <div class="success-actions">
          <button class="btn btn-secondary" type="button" data-go-dashboard>查看我的资料 →</button>
          <a class="text-link" href="${homeUrl()}">返回会员礼列表</a>
        </div>
      </section>`;
    C.$("[data-copy-code]").addEventListener("click", async (event) => {
      const ok = await C.copyText(event.currentTarget.getAttribute("data-copy-code"));
      C.toast(ok ? "查询码已复制。" : "复制失败，请手动选择复制。", ok ? "success" : "error");
    });
    bindPackageActions(submission);
    C.$("[data-go-dashboard]").addEventListener("click", () => {
      history.replaceState(null, "", dashboardUrl());
      renderDashboard();
    });
  }

  function bindPackageActions(submission) {
    const download = C.$("[data-download-package]");
    const share = C.$("[data-share-package]");
    if (download) download.addEventListener("click", () => downloadPackage(submission));
    if (share) share.addEventListener("click", () => sharePackage(submission));
  }

  function packageFor(submission, campaign) {
    return DB.buildPackage(submission, campaign);
  }

  function packageFilename(submission) {
    return `猫神会员礼-${C.safeFilePart(submission.campaignTitle)}-${submission.phone}.json`;
  }

  async function downloadPackage(submission) {
    const campaign = state.campaigns.find((item) => item.id === submission.campaignId) || (await DB.getCampaign(submission.campaignId));
    const pkg = packageFor(submission, campaign);
    C.downloadText(packageFilename(submission), JSON.stringify(pkg, null, 2));
    C.toast("资料包已下载，请发送给管理员。", "success");
  }

  async function sharePackage(submission) {
    const campaign = state.campaigns.find((item) => item.id === submission.campaignId) || (await DB.getCampaign(submission.campaignId));
    const pkg = packageFor(submission, campaign);
    const filename = packageFilename(submission);
    const file = new File([JSON.stringify(pkg, null, 2)], filename, { type: "application/json" });
    const shared = await C.shareFiles([file], "猫神会员礼资料包", "请管理员导入这份会员礼资料包");
    if (!shared) {
      C.downloadText(filename, JSON.stringify(pkg, null, 2));
      C.toast("当前浏览器不支持直接分享，已为你下载资料包。", "info");
    }
  }

  function imageExtension(dataUrl) {
    const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);/i);
    if (!match) return "jpg";
    return match[1].toLowerCase().replace("jpeg", "jpg");
  }

  function renderDashboard() {
    if (!state.currentSub) {
      renderLogin();
      return;
    }
    const submission = state.currentSub;
    setTitle("我的资料");
    const campaign = state.campaigns.find((item) => item.id === submission.campaignId);
    const address = `${submission.province} ${submission.city} ${submission.addressDetail}`;
    const updateNotice = state.justUpdated
      ? `<div class="state-banner"><span>✓</span><p><strong>修改已保存。</strong>请重新下载资料包并发送给管理员，否则管理员收到的还是旧资料。</p></div>`
      : "";
    app.innerHTML = `
      <section class="dashboard-page">
        <div class="dashboard-heading">
          <div>
            <p class="eyebrow"><span></span> MY SUBMISSION</p>
            <h1>你好，${C.escapeHtml(submission.wechat)}</h1>
            <p class="lead">这是你保存在当前浏览器里的「${C.escapeHtml(submission.campaignTitle)}」登记资料。</p>
          </div>
          <div class="dashboard-actions"><a class="btn btn-primary" href="${lookupUrl()}">修改资料 <span class="btn-arrow">→</span></a></div>
        </div>
        ${updateNotice}
        <div class="dashboard-grid">
          <div class="info-card">
            <div class="card-head"><div><p class="form-kicker">CAMPAIGN</p><h2>${C.escapeHtml(submission.campaignTitle)}</h2></div><span class="status-pill"><i></i>已登记</span></div>
            <dl class="detail-list">
              <div><dt>会员礼类型</dt><dd>${C.escapeHtml(submission.campaignType)}</dd></div>
              <div><dt>主播 / 频道</dt><dd>${C.escapeHtml(submission.honoree || "—")}</dd></div>
              <div><dt>收件人手机号</dt><dd class="mono">${C.escapeHtml(submission.phone)}</dd></div>
              <div><dt>收货地址</dt><dd>${C.escapeHtml(address)}</dd></div>
              <div><dt>微信会员群昵称</dt><dd>${C.escapeHtml(submission.wechat)}</dd></div>
              <div><dt>抖音昵称</dt><dd>${C.escapeHtml(submission.douyin)}</dd></div>
            </dl>
            <div class="meta-line"><span>首次保存：${C.formatDate(submission.createdAt)}</span><span>最近修改：${C.formatDate(submission.updatedAt)}</span></div>
          </div>
          <aside class="proof-side">
            <div class="info-card">
              <div class="card-head"><div><p class="form-kicker">TWO PROOFS</p><h2>会员证明</h2></div></div>
              <div class="proof-mini-grid">
                <figure><img src="${C.escapeHtml(submission.diamondImage)}" alt="钻石消费记录"><figcaption>钻石消费记录</figcaption><button type="button" class="text-button" data-download-proof="diamond">下载原图</button></figure>
                <figure><img src="${C.escapeHtml(submission.expiryImage)}" alt="会员截止日期记录"><figcaption>会员截止日期记录</figcaption><button type="button" class="text-button" data-download-proof="expiry">下载原图</button></figure>
              </div>
            </div>
            <div class="package-box">
              <strong>把资料交给管理员</strong>
              <p>离线备用模式不会自动上传。请下载资料包并通过微信 / 邮件发送给管理员。</p>
              <div class="package-actions"><button class="btn btn-primary btn-block" type="button" data-download-package>下载资料包</button><button class="btn btn-ghost btn-block" type="button" data-share-package>分享给管理员</button></div>
            </div>
            <div class="dashboard-links">
              <button class="text-button" type="button" data-logout>退出登录</button>
              <a class="text-link" href="${homeUrl()}">浏览其他会员礼 →</a>
            </div>
          </aside>
        </div>
      </section>`;
    C.$$("[data-download-proof]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = button.getAttribute("data-download-proof");
        C.downloadDataUrl(
          `${C.safeFilePart(submission.campaignTitle)}-${kind === "diamond" ? "钻石消费记录" : "会员截止日期"}.${imageExtension(kind === "diamond" ? submission.diamondImage : submission.expiryImage)}`,
          kind === "diamond" ? submission.diamondImage : submission.expiryImage
        );
      });
    });
    C.$("[data-download-package]").addEventListener("click", () => downloadPackage(submission));
    C.$("[data-share-package]").addEventListener("click", () => sharePackage(submission));
    C.$("[data-logout]").addEventListener("click", logout);
    // The edit link needs a real route rather than a hash.
    const editLink = C.$(".dashboard-actions a");
    if (editLink) {
      editLink.addEventListener("click", (event) => {
        event.preventDefault();
        const found = state.campaigns.find((item) => item.id === submission.campaignId) || {
          id: submission.campaignId,
          type: submission.campaignType,
          title: submission.campaignTitle,
          honoree: submission.honoree,
          description: "",
          deadline: "",
          active: true,
          exampleDiamond: "assets/example-diamond.svg",
          exampleExpiry: "assets/example-expiry.svg"
        };
        if (!campaign) state.campaigns.push(found);
        renderForm(found, submission);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  function renderLogin() {
    setTitle("查询我的资料");
    const tallyCampaigns = state.campaigns.filter((campaign) => campaign.active && C.normalizeTallyUrl(campaign.tallyUrl));
    const tallyNotice = tallyCampaigns.length
      ? `<div class="mini-note"><strong>Tally 在线表单提交的资料不在这里</strong><p>使用 Tally 表单提交后，资料会直接进入管理员的 Tally 后台，不会保存在你的浏览器。本页只用于查询「离线资料包」模式登记的记录；Tally 记录如需修改，请联系管理员。</p></div>`
      : `<div class="mini-note"><strong>资料只在当前浏览器</strong><p>如果你换了设备，请先导入之前下载的资料包。管理员后台无法远程读取你的浏览器数据。</p></div>`;
    app.innerHTML = `
      <section class="login-page">
        <div class="login-copy">
          <p class="eyebrow"><span></span> PRIVATE ACCESS</p>
          <h1>只看自己的<br><em>那一份资料。</em></h1>
          <p class="lead">输入登记时使用的手机号和生成的 12 位查询码，即可查看、修改自己的资料，并重新下载资料包。</p>
          ${tallyNotice}
          <a class="text-link" href="${homeUrl()}">← 返回会员礼列表</a>
        </div>
        <div class="login-panel">
          <div class="panel-head"><div><p class="form-kicker">MEMBER ACCESS</p><h2>查询 / 修改</h2></div><span class="lock-badge">私密</span></div>
          <div class="form-alert-slot" data-login-alert></div>
          <form data-login-form novalidate>
            <div class="field"><label for="login-phone">手机号</label><input class="text-input" id="login-phone" type="tel" inputmode="numeric" maxlength="13" autocomplete="tel" placeholder="登记时填写的 11 位手机号"></div>
            <div class="field"><label for="login-code">查询码</label><input class="text-input code-input" id="login-code" type="text" maxlength="16" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><p class="field-hint">不区分大小写，可以连同短横线一起输入。</p></div>
            <button class="btn btn-primary btn-block" type="submit">验证并查看 <span>→</span></button>
          </form>
          <div class="login-separator"><span>换设备了？</span></div>
          <label class="import-package-button" for="user-package-input"><span>↑</span><strong>导入我的资料包</strong><small>选择提交时下载的 JSON 资料包</small></label>
          <input class="visually-hidden" id="user-package-input" type="file" accept="application/json,.json">
          <p class="panel-fineprint">${tallyCampaigns.length ? "Tally 在线提交的资料在管理员后台，不在本页；本页仅用于旧版离线资料包记录。" : "查询码遗失且没有资料包时，管理员无法从服务器找回，因为资料从未上传到服务器。"}</p>
        </div>
      </section>`;
    const codeInput = C.$("#login-code");
    codeInput.addEventListener("input", () => {
      const raw = C.normalizeCode(codeInput.value).slice(0, 12);
      codeInput.value = (raw.match(/.{1,4}/g) || []).join("-");
    });
    C.$("[data-login-form]").addEventListener("submit", handleLogin);
    C.$("#user-package-input").addEventListener("change", handleUserPackageImport);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const alert = C.$("[data-login-alert]");
    alert.innerHTML = "";
    const phone = C.normalizePhone(C.$("#login-phone").value);
    const code = C.$("#login-code").value;
    if (!C.isValidPhone(phone)) {
      alert.innerHTML = `<div class="form-alert"><strong>无法登录</strong><p>请输入有效的 11 位手机号。</p></div>`;
      return;
    }
    if (!C.isValidCode(code)) {
      alert.innerHTML = `<div class="form-alert"><strong>无法登录</strong><p>查询码应为 12 位，请检查后重试。</p></div>`;
      return;
    }
    const button = C.$("[data-login-form] button[type=submit]");
    button.disabled = true;
    button.textContent = "正在验证…";
    try {
      const rows = await DB.findByPhone(phone);
      if (!rows.length) {
        alert.innerHTML = `<div class="form-alert"><strong>本浏览器没有这条记录</strong><p>如果你在另一台设备登记，请先在下方导入资料包；或联系管理员。</p></div>`;
        return;
      }
      let matched = null;
      for (const row of rows) {
        const ok = await C.verifySecret(C.normalizeCode(code), row.accessSalt, row.accessHash, Number(row.accessIterations) || C.QUERY_ITERATIONS);
        if (ok) {
          matched = row;
          break;
        }
      }
      if (!matched) {
        alert.innerHTML = `<div class="form-alert"><strong>查询码不正确</strong><p>请检查手机号和查询码是否对应。连续输错不会解锁任何远程数据，因为数据只在本地。</p></div>`;
        return;
      }
      state.currentSub = matched;
      setUserSession(matched);
      history.replaceState(null, "", dashboardUrl());
      renderDashboard();
      C.toast("已进入你的资料页。", "success");
    } catch (error) {
      alert.innerHTML = `<div class="form-alert"><strong>验证失败</strong><p>${C.escapeHtml(error.message || "请稍后重试。")}</p></div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = "验证并查看 <span>→</span>";
    }
  }

  async function handleUserPackageImport(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const alert = C.$("[data-login-alert]");
    try {
      const text = await file.text();
      const result = await DB.importUserPackage(text);
      const phoneInput = C.$("#login-phone");
      if (phoneInput) phoneInput.value = result.submission.phone;
      alert.innerHTML = `<div class="form-alert form-alert-success"><strong>资料包已导入本机</strong><p>请用手机号和查询码登录。查询码不会包含在资料包中。</p></div>`;
      C.toast("资料包已导入。", "success");
    } catch (error) {
      alert.innerHTML = `<div class="form-alert"><strong>导入失败</strong><p>${C.escapeHtml(error.message || "文件格式不正确。")}</p></div>`;
    } finally {
      event.target.value = "";
    }
  }

  function logout() {
    safeSessionClear();
    state.currentSub = null;
    state.lastCode = "";
    history.replaceState(null, "", homeUrl());
    renderLanding();
    C.toast("已退出登录。", "info");
  }

  function renderNotFound() {
    setTitle("活动不存在");
    app.innerHTML = `<section class="error-page"><p class="error-code">404</p><h1>找不到这份会员礼</h1><p class="lead">活动可能已结束、被关闭，或链接填写有误。</p><a class="btn btn-primary" href="${homeUrl()}">返回会员礼列表</a></section>`;
  }

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#lookup") {
      if (state.currentSub) renderDashboard();
      else renderLogin();
    }
  });
  window.addEventListener("beforeunload", () => {
    /* Data is already saved in IndexedDB; nothing to flush. */
  });

  boot().catch((error) => {
    console.error(error);
    app.innerHTML = `<section class="error-page"><p class="error-code">!</p><h1>页面无法启动</h1><p class="lead">${C.escapeHtml(error.message || "浏览器本地数据库不可用。请尝试更新浏览器，或通过 HTTPS / GitHub Pages 打开本页面。")}</p><button class="btn btn-primary" type="button" data-reload>重新加载</button></section>`;
    const reload = C.$("[data-reload]");
    if (reload) reload.addEventListener("click", () => window.location.reload());
  });
})();
