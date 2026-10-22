/* 猫神会员礼系统 · IndexedDB 本地数据层（纯浏览器，无后端） */
(function () {
  "use strict";

  const C = window.Cathen;
  const DB_NAME = "catshen_member_gifts";
  const DB_VERSION = 1;
  const FORMAT = "catshen-member-gift-package";
  const PACKAGE_VERSION = 1;

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("当前浏览器不支持 IndexedDB。请使用最新版 Chrome、Edge、Safari 或 Firefox。"));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("campaigns")) {
          const store = db.createObjectStore("campaigns", { keyPath: "id" });
          store.createIndex("sortOrder", "sortOrder", { unique: false });
          store.createIndex("active", "active", { unique: false });
        }
        if (!db.objectStoreNames.contains("submissions")) {
          const store = db.createObjectStore("submissions", { keyPath: "key" });
          store.createIndex("campaignId", "campaignId", { unique: false });
          store.createIndex("phone", "phone", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开本地数据库。"));
      request.onblocked = () => reject(new Error("本地数据库被其他页面占用，请关闭其他标签页后重试。"));
    });
    return dbPromise;
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("本地数据库操作失败。"));
      tx.onabort = () => reject(tx.error || new Error("本地数据库操作被中止。"));
    });
  }

  async function dbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbPut(storeName, value) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await transactionDone(tx);
    return value;
  }

  async function dbDelete(storeName, key) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await transactionDone(tx);
  }

  async function dbClear(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    await transactionDone(tx);
  }

  function defaultSiteSettings() {
    const config = window.CATHEN_CONFIG || {};
    return {
      siteTitle: config.siteTitle || "猫神会员礼系统",
      heroTitle: config.heroTitle || "替主播，把每一份|会员礼登记清楚。",
      heroSubtitle: config.heroSubtitle || "",
      publicNotice: config.publicNotice || ""
    };
  }

  function normalizeCampaign(input, index) {
    const source = input || {};
    const id = String(source.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const type = String(source.type || "会员礼").trim().slice(0, 30) || "会员礼";
    const title = String(source.title || "未命名会员礼").trim().slice(0, 80) || "未命名会员礼";
    return {
      id: id || C.uid("gift"),
      type,
      title,
      honoree: String(source.honoree || "").trim().slice(0, 40),
      description: String(source.description || "").trim().slice(0, 500),
      deadline: String(source.deadline || "").trim().slice(0, 20),
      active: source.active !== false,
      tallyUrl: C.normalizeTallyUrl(source.tallyUrl),
      allowOffline: source.allowOffline === true,
      exampleDiamond: C.safeImageSrc(source.exampleDiamond) || "assets/example-diamond.svg",
      exampleExpiry: C.safeImageSrc(source.exampleExpiry) || "assets/example-expiry.svg",
      sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : (index || 0),
      createdAt: source.createdAt || C.nowIso(),
      updatedAt: source.updatedAt || C.nowIso()
    };
  }

  function configCampaigns() {
    const config = window.CATHEN_CONFIG || {};
    return (Array.isArray(config.campaigns) ? config.campaigns : []).map(normalizeCampaign);
  }

  async function getSetting(key, fallback) {
    const row = await dbGet("settings", key);
    return row ? row.value : fallback;
  }

  async function setSetting(key, value) {
    await dbPut("settings", { key, value });
    return value;
  }

  async function getSiteSettings() {
    const saved = await getSetting("siteSettings", null);
    return Object.assign(defaultSiteSettings(), saved || {});
  }

  async function saveSiteSettings(settings) {
    const current = await getSiteSettings();
    const next = {
      siteTitle: String(settings.siteTitle || current.siteTitle).trim().slice(0, 60) || current.siteTitle,
      heroTitle: String(settings.heroTitle || current.heroTitle).trim().slice(0, 120),
      heroSubtitle: String(settings.heroSubtitle || "").trim().slice(0, 300),
      publicNotice: String(settings.publicNotice || "").trim().slice(0, 400)
    };
    await setSetting("siteSettings", next);
    return next;
  }

  async function getAdminAuth() {
    return getSetting("adminAuth", null);
  }

  async function setAdminPassword(password) {
    const salt = C.randomSaltHex();
    const hash = await C.hashSecret(password, salt, C.ADMIN_ITERATIONS);
    const auth = {
      salt,
      hash,
      iterations: C.ADMIN_ITERATIONS,
      updatedAt: C.nowIso()
    };
    await setSetting("adminAuth", auth);
    return auth;
  }

  async function verifyAdminPassword(password) {
    const auth = await getAdminAuth();
    if (!auth) return false;
    return C.verifySecret(password, auth.salt, auth.hash, auth.iterations);
  }

  async function ensureAdminCampaigns() {
    const initialized = await getSetting("campaignsInitialized", false);
    if (initialized) return;
    const existing = await dbGetAll("campaigns");
    if (!existing.length) {
      const campaigns = configCampaigns();
      for (let index = 0; index < campaigns.length; index += 1) {
        const campaign = campaigns[index];
        campaign.sortOrder = index;
        await dbPut("campaigns", campaign);
      }
    }
    await setSetting("campaignsInitialized", true);
  }

  async function listCampaigns(includeInactive) {
    const campaigns = await dbGetAll("campaigns");
    return campaigns
      .filter((campaign) => includeInactive !== false || campaign.active)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async function getCampaign(id) {
    return dbGet("campaigns", id);
  }

  async function saveCampaign(input) {
    const existing = input.id ? await dbGet("campaigns", input.id) : null;
    const normalized = normalizeCampaign(
      Object.assign({}, existing || {}, input, {
        id: input.id || existing?.id || C.uid("gift"),
        createdAt: existing?.createdAt || input.createdAt || C.nowIso(),
        updatedAt: C.nowIso()
      }),
      input.sortOrder
    );
    if (!existing) {
      const all = await listCampaigns(true);
      normalized.sortOrder = all.length;
    }
    await dbPut("campaigns", normalized);
    return normalized;
  }

  async function deleteCampaign(id) {
    await dbDelete("campaigns", id);
  }

  async function countSubmissionsForCampaign(id) {
    const all = await dbGetAll("submissions");
    return all.filter((sub) => sub.campaignId === id).length;
  }

  function submissionKey(campaignId, phone) {
    return `${campaignId}::${C.normalizePhone(phone)}`;
  }

  async function getSubmission(key) {
    return dbGet("submissions", key);
  }

  async function getSubmissionByCampaignPhone(campaignId, phone) {
    return dbGet("submissions", submissionKey(campaignId, phone));
  }

  async function saveSubmission(submission) {
    const phone = C.normalizePhone(submission.phone);
    const key = submission.key || submissionKey(submission.campaignId, phone);
    const value = Object.assign({}, submission, { key, phone });
    await dbPut("submissions", value);
    return value;
  }

  async function updateSubmission(key, patch) {
    const existing = await dbGet("submissions", key);
    if (!existing) throw new Error("找不到这条登记记录。");
    const merged = Object.assign({}, existing, patch, { updatedAt: C.nowIso() });
    if (C.normalizePhone(merged.phone) !== existing.phone) {
      merged.key = submissionKey(merged.campaignId, merged.phone);
      if (merged.key !== existing.key) {
        const collision = await dbGet("submissions", merged.key);
        if (collision) throw new Error("这个手机号在本次会员礼中已经有记录。");
        await dbDelete("submissions", existing.key);
      }
    }
    await dbPut("submissions", merged);
    return merged;
  }

  async function deleteSubmission(key) {
    await dbDelete("submissions", key);
  }

  async function listSubmissions(options) {
    const settings = Object.assign({ campaignId: "", q: "", phone: "" }, options || {});
    let rows = await dbGetAll("submissions");
    if (settings.campaignId) rows = rows.filter((row) => row.campaignId === settings.campaignId);
    if (settings.phone) {
      const phone = C.normalizePhone(settings.phone);
      rows = rows.filter((row) => row.phone === phone);
    }
    if (settings.q) {
      const q = String(settings.q).toLowerCase();
      rows = rows.filter((row) =>
        [row.phone, row.wechat, row.douyin, row.campaignTitle, row.campaignType, row.honoree, row.province, row.city, row.addressDetail]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }
    return rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }

  async function findByPhone(phone) {
    const normalized = C.normalizePhone(phone);
    const rows = await dbGetAll("submissions");
    return rows.filter((row) => row.phone === normalized);
  }

  async function stats() {
    const [submissions, campaigns] = await Promise.all([dbGetAll("submissions"), listCampaigns(true)]);
    const today = C.formatDate(C.nowIso(), false);
    return {
      total: submissions.length,
      today: submissions.filter((row) => C.formatDate(row.createdAt, false) === today).length,
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.active).length
    };
  }

  function assertImageData(value, label) {
    if (typeof value !== "string" || !/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) {
      throw new Error(`${label}格式无效。`);
    }
    if (value.length > 16 * 1024 * 1024) {
      throw new Error(`${label}文件过大。`);
    }
    return value;
  }

  function cleanText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function normalizePackage(raw) {
    let data = raw;
    if (typeof raw === "string") {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error("资料包不是有效的 JSON 文件。");
      }
    }
    if (!data || data.format !== FORMAT || Number(data.version) !== PACKAGE_VERSION) {
      throw new Error("不是本系统导出的资料包，或版本不受支持。");
    }
    const campaign = data.campaign || {};
    const submission = data.submission || {};
    const phone = C.normalizePhone(submission.phone);
    if (!C.isValidPhone(phone)) throw new Error("资料包中的手机号无效。");
    if (!submission.diamondImage || !submission.expiryImage) throw new Error("资料包缺少两张证明图片。");
    const campaignTitle = cleanText(campaign.title || submission.campaignTitle || "会员礼", 80);
    const campaignId = cleanText(campaign.id || submission.campaignId || C.uid("imported"), 80).replace(/[^a-zA-Z0-9_-]/g, "") || C.uid("imported");
    const accessIterations = Number(submission.accessIterations) || 180000;
    if (accessIterations < 10000 || accessIterations > 500000) throw new Error("资料包中的验证参数无效。");
    const accessSalt = cleanText(submission.accessSalt, 80);
    const accessHash = cleanText(submission.accessHash, 128);
    if (!/^[a-f0-9]{32}$/i.test(accessSalt) || !/^[a-f0-9]{64}$/i.test(accessHash)) {
      throw new Error("资料包缺少有效的查询码信息。");
    }
    const clean = {
      key: submissionKey(campaignId, phone),
      campaignId,
      campaignType: cleanText(campaign.type || submission.campaignType || "会员礼", 30),
      campaignTitle,
      honoree: cleanText(campaign.honoree || submission.honoree || "", 40),
      phone,
      wechat: cleanText(submission.wechat, 60),
      douyin: cleanText(submission.douyin, 60),
      province: cleanText(submission.province, 20),
      city: cleanText(submission.city, 30),
      addressDetail: cleanText(submission.addressDetail, 120),
      diamondImage: assertImageData(submission.diamondImage, "钻石消费记录"),
      expiryImage: assertImageData(submission.expiryImage, "会员截止日期记录"),
      accessSalt,
      accessHash,
      accessIterations,
      createdAt: submission.createdAt || C.nowIso(),
      updatedAt: submission.updatedAt || C.nowIso(),
      source: "imported"
    };
    if (!clean.wechat) throw new Error("资料包缺少微信会员群昵称。");
    if (!clean.douyin) throw new Error("资料包缺少抖音昵称。");
    if (!clean.province || !clean.city) throw new Error("资料包中的地址缺少省市。");
    if (!clean.addressDetail) throw new Error("资料包中的详细地址为空。");
    return {
      package: {
        format: FORMAT,
        version: PACKAGE_VERSION,
        exportedAt: data.exportedAt || C.nowIso(),
        campaign: {
          id: campaignId,
          type: clean.campaignType,
          title: campaignTitle,
          honoree: clean.honoree,
          description: cleanText(campaign.description, 500),
          deadline: cleanText(campaign.deadline, 20),
          exampleDiamond: C.safeImageSrc(campaign.exampleDiamond) || "assets/example-diamond.svg",
          exampleExpiry: C.safeImageSrc(campaign.exampleExpiry) || "assets/example-expiry.svg"
        },
        submission: {
          phone: clean.phone,
          wechat: clean.wechat,
          douyin: clean.douyin,
          province: clean.province,
          city: clean.city,
          addressDetail: clean.addressDetail,
          diamondImage: clean.diamondImage,
          expiryImage: clean.expiryImage,
          accessSalt: clean.accessSalt,
          accessHash: clean.accessHash,
          accessIterations: clean.accessIterations,
          createdAt: clean.createdAt,
          updatedAt: clean.updatedAt
        }
      },
      clean
    };
  }

  async function ensureCampaignFromPackage(campaign) {
    const existing = await dbGet("campaigns", campaign.id);
    if (existing) return existing;
    const campaignData = normalizeCampaign(
      {
        id: campaign.id,
        type: campaign.type,
        title: campaign.title,
        honoree: campaign.honoree,
        description: campaign.description,
        deadline: campaign.deadline,
        active: false,
        exampleDiamond: campaign.exampleDiamond,
        exampleExpiry: campaign.exampleExpiry,
        createdAt: C.nowIso(),
        updatedAt: C.nowIso()
      },
      999
    );
    await dbPut("campaigns", campaignData);
    return campaignData;
  }

  async function importPackage(raw, options) {
    const settings = Object.assign({ ensureCampaign: true, overwriteNewer: true }, options || {});
    const parsed = normalizePackage(raw);
    if (settings.ensureCampaign) await ensureCampaignFromPackage(parsed.package.campaign);
    const existing = await getSubmission(parsed.clean.key);
    if (existing && settings.overwriteNewer !== false) {
      const oldTime = new Date(existing.updatedAt || 0).getTime();
      const newTime = new Date(parsed.clean.updatedAt || 0).getTime();
      if (oldTime > newTime) {
        return { status: "skipped", submission: existing, campaign: parsed.package.campaign };
      }
    }
    const saved = await saveSubmission(parsed.clean);
    return {
      status: existing ? "updated" : "added",
      submission: saved,
      campaign: parsed.package.campaign
    };
  }

  async function importUserPackage(raw) {
    const parsed = normalizePackage(raw);
    const saved = await saveSubmission(parsed.clean);
    return { status: "imported", submission: saved };
  }

  function buildPackage(submission, campaign) {
    return {
      format: FORMAT,
      version: PACKAGE_VERSION,
      exportedAt: C.nowIso(),
      campaign: {
        id: submission.campaignId,
        type: submission.campaignType,
        title: submission.campaignTitle,
        honoree: submission.honoree || "",
        description: campaign?.description || "",
        deadline: campaign?.deadline || "",
        exampleDiamond: campaign?.exampleDiamond || "assets/example-diamond.svg",
        exampleExpiry: campaign?.exampleExpiry || "assets/example-expiry.svg"
      },
      submission: {
        phone: submission.phone,
        wechat: submission.wechat,
        douyin: submission.douyin,
        province: submission.province,
        city: submission.city,
        addressDetail: submission.addressDetail,
        diamondImage: submission.diamondImage,
        expiryImage: submission.expiryImage,
        accessSalt: submission.accessSalt,
        accessHash: submission.accessHash,
        accessIterations: submission.accessIterations,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt
      }
    };
  }

  async function exportAllData() {
    const [adminAuth, siteSettings, campaigns, submissions] = await Promise.all([
      getAdminAuth(),
      getSiteSettings(),
      dbGetAll("campaigns"),
      dbGetAll("submissions")
    ]);
    return {
      format: "catshen-member-gift-backup",
      version: 1,
      exportedAt: C.nowIso(),
      adminAuth,
      siteSettings,
      campaigns,
      submissions
    };
  }

  async function importAllData(data, options) {
    if (!data || data.format !== "catshen-member-gift-backup" || Number(data.version) !== 1) {
      throw new Error("不是本系统导出的完整备份文件。");
    }
    if (!Array.isArray(data.campaigns) || !Array.isArray(data.submissions)) {
      throw new Error("备份文件内容不完整。");
    }
    const preserveAdmin = Boolean(options && options.preserveAdmin);
    const currentAuth = preserveAdmin ? await getAdminAuth() : null;
    const safeSubmissions = data.submissions
      .filter((submission) => submission && submission.phone && submission.campaignId)
      .map((submission) => {
        const campaignId = String(submission.campaignId || "").replace(/[^a-zA-Z0-9_-]/g, "");
        const phone = C.normalizePhone(submission.phone);
        if (!campaignId || !C.isValidPhone(phone)) return null;
        return Object.assign({}, submission, {
          key: submissionKey(campaignId, phone),
          campaignId,
          phone,
          diamondImage: assertImageData(submission.diamondImage, "钻石消费记录"),
          expiryImage: assertImageData(submission.expiryImage, "会员截止日期记录")
        });
      })
      .filter(Boolean);
    const db = await openDB();
    const tx = db.transaction(["settings", "campaigns", "submissions"], "readwrite");
    tx.objectStore("settings").clear();
    tx.objectStore("campaigns").clear();
    tx.objectStore("submissions").clear();
    const authToUse = preserveAdmin ? currentAuth : data.adminAuth;
    if (authToUse) tx.objectStore("settings").put({ key: "adminAuth", value: authToUse });
    if (data.siteSettings) tx.objectStore("settings").put({ key: "siteSettings", value: data.siteSettings });
    tx.objectStore("settings").put({ key: "campaignsInitialized", value: true });
    data.campaigns.forEach((campaign) => tx.objectStore("campaigns").put(normalizeCampaign(campaign)));
    safeSubmissions.forEach((submission) => tx.objectStore("submissions").put(submission));
    await transactionDone(tx);
  }

  async function clearAllData() {
    await Promise.all([dbClear("settings"), dbClear("campaigns"), dbClear("submissions")]);
  }

  async function storageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch (error) {
      return null;
    }
  }

  window.CathenDB = {
    FORMAT,
    PACKAGE_VERSION,
    openDB,
    getSetting,
    setSetting,
    getSiteSettings,
    saveSiteSettings,
    getAdminAuth,
    setAdminPassword,
    verifyAdminPassword,
    ensureAdminCampaigns,
    configCampaigns,
    listCampaigns,
    getCampaign,
    saveCampaign,
    deleteCampaign,
    countSubmissionsForCampaign,
    submissionKey,
    getSubmission,
    getSubmissionByCampaignPhone,
    saveSubmission,
    updateSubmission,
    deleteSubmission,
    listSubmissions,
    findByPhone,
    stats,
    normalizePackage,
    importPackage,
    importUserPackage,
    buildPackage,
    exportAllData,
    importAllData,
    clearAllData,
    storageEstimate
  };
})();
