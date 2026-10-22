/* 猫神会员礼系统 · 公共浏览器工具（无第三方依赖） */
(function () {
  "use strict";

  const QUERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const QUERY_ITERATIONS = 180000;
  const ADMIN_ITERATIONS = 250000;
  const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const IMAGE_MAX_BYTES = 15 * 1024 * 1024;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDate(value, withTime) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (n) => String(n).padStart(2, "0");
    const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return withTime === false ? base : `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatDeadline(value) {
    if (!value) return "";
    return String(value).replace(/-/g, ".");
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix || "id"}_${window.crypto.randomUUID()}`;
    }
    return `${prefix || "id"}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function toast(message, kind) {
    const root = $("#toast-root");
    if (!root) return;
    const node = document.createElement("div");
    node.className = `toast toast-${kind || "success"}`;
    node.setAttribute("role", "status");
    node.innerHTML = `<span class="toast-mark">${kind === "error" ? "!" : kind === "info" ? "i" : "✓"}</span><span>${escapeHtml(message)}</span>`;
    root.appendChild(node);
    window.setTimeout(() => {
      node.classList.add("is-leaving");
      window.setTimeout(() => node.remove(), 250);
    }, 3600);
  }

  function openModal(options) {
    const root = $("#modal-root");
    if (!root) return null;
    const settings = Object.assign({ title: "", content: "", footer: "", wide: false }, options || {});
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="modal${settings.wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(settings.title)}">
        <header class="modal-head">
          <h2>${escapeHtml(settings.title)}</h2>
          <button class="icon-button" type="button" data-modal-close aria-label="关闭">×</button>
        </header>
        <div class="modal-body" data-modal-body></div>
        <footer class="modal-foot" data-modal-foot></footer>
      </section>`;
    const body = backdrop.querySelector("[data-modal-body]");
    const footer = backdrop.querySelector("[data-modal-foot]");
    if (settings.content instanceof Node) body.appendChild(settings.content);
    else body.innerHTML = settings.content || "";
    if (settings.footer instanceof Node) footer.appendChild(settings.footer);
    else footer.innerHTML = settings.footer || "";
    footer.hidden = !footer.innerHTML.trim();
    root.appendChild(backdrop);
    document.body.classList.add("modal-open");
    const previousFocus = document.activeElement;
    const close = () => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      document.body.classList.remove("modal-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
      if (typeof settings.onClose === "function") settings.onClose();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    backdrop.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", close));
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) close();
    });
    const focusable = backdrop.querySelector(".modal-body input:not([type='hidden']), .modal-body select, .modal-body textarea, .modal-body button, [data-modal-close]");
    if (focusable) focusable.focus();
    return { element: backdrop, body, footer, close };
  }

  function confirmDialog(options) {
    const settings = Object.assign(
      { title: "请确认", message: "", confirmText: "确认", cancelText: "取消", danger: false },
      options || {}
    );
    return new Promise((resolve) => {
      let settled = false;
      const modal = openModal({
        title: settings.title,
        content: `<p class="confirm-message">${escapeHtml(settings.message).replace(/\n/g, "<br>")}</p>`,
        footer: `<div class="modal-actions"><button class="btn btn-ghost" type="button" data-cancel>${escapeHtml(settings.cancelText)}</button><button class="btn ${settings.danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm>${escapeHtml(settings.confirmText)}</button></div>`,
        onClose: () => {
          if (!settled) resolve(false);
        }
      });
      if (!modal) {
        resolve(window.confirm(settings.message));
        return;
      }
      modal.footer.querySelector("[data-cancel]").addEventListener("click", () => {
        settled = true;
        modal.close();
        resolve(false);
      });
      modal.footer.querySelector("[data-confirm]").addEventListener("click", () => {
        settled = true;
        modal.close();
        resolve(true);
      });
    });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadText(filename, text, type) {
    downloadBlob(filename, new Blob([text], { type: type || "application/json;charset=utf-8" }));
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const meta = parts[0] || "data:application/octet-stream;base64";
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  function downloadDataUrl(filename, dataUrl) {
    downloadBlob(filename, dataUrlToBlob(dataUrl));
  }

  function safeFilePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 48) || "资料";
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* fall through */
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "visually-hidden";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("无法读取图片文件。"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("图片无法解析，请换一张 JPG / PNG / WebP 图片。"));
      image.src = dataUrl;
    });
  }

  async function compressImage(file, options) {
    if (!(file instanceof File)) throw new Error("请选择图片文件。");
    if (IMAGE_TYPES.indexOf(file.type) === -1) {
      throw new Error("只支持 JPG、PNG、WebP 格式的图片。");
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new Error("图片不能超过 15MB，请压缩后再试。");
    }
    const settings = Object.assign({ maxDim: 1600, quality: 0.86, maxBytes: 3.2 * 1024 * 1024 }, options || {});
    const source = await fileToDataUrl(file);
    const image = await loadImage(source);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片尺寸无效。");
    if (image.naturalWidth * image.naturalHeight > 60000000) {
      throw new Error("图片尺寸过大，请先裁剪后再上传。");
    }
    let maxDim = settings.maxDim;
    let quality = settings.quality;
    let dataUrl = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ratio = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * ratio));
      const height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      const bytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
      if (bytes <= settings.maxBytes) break;
      maxDim = Math.round(maxDim * 0.8);
      quality = Math.max(0.68, quality - 0.08);
    }
    const payload = dataUrl.split(",")[1] || "";
    return {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      bytes: Math.round(payload.length * 0.75),
      originalName: file.name
    };
  }

  function hexToBytes(hex) {
    const normalized = String(hex || "");
    if (normalized.length % 2 !== 0) throw new Error("哈希参数无效。");
    const output = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < output.length; index += 1) {
      output[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    }
    return output;
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function randomSaltHex() {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  async function hashSecret(secret, saltHex, iterations) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("当前浏览器不支持安全加密。请通过 HTTPS 或 GitHub Pages 打开本系统。");
    }
    const key = await window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(secret)),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: hexToBytes(saltHex),
        iterations: iterations,
        hash: "SHA-256"
      },
      key,
      256
    );
    return bytesToHex(bits);
  }

  function constantTimeEqual(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return diff === 0;
  }

  async function verifySecret(secret, saltHex, expectedHash, iterations) {
    const actual = await hashSecret(secret, saltHex, iterations);
    return constantTimeEqual(actual, expectedHash);
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[\s\-‐‑–—]/g, "");
  }

  function isValidPhone(value) {
    return /^1[3-9]\d{9}$/.test(normalizePhone(value));
  }

  function normalizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function isValidCode(value) {
    return /^[A-Z2-9]{12}$/.test(normalizeCode(value));
  }

  function generateQueryCode() {
    const bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    const chars = Array.from(bytes)
      .map((byte) => QUERY_CODE_ALPHABET[byte % QUERY_CODE_ALPHABET.length])
      .join("");
    return chars.match(/.{1,4}/g).join("-");
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function campaignLabel(campaign) {
    if (!campaign) return "会员礼";
    return campaign.type ? `${campaign.type} · ${campaign.title}` : campaign.title;
  }

  function safeImageSrc(src) {
    const value = String(src || "").trim();
    if (!value) return "";
    if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);/i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (!value.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
    return "";
  }

  function normalizeTallyUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    const match = raw.match(/https:\/\/(?:www\.)?tally\.so\/(?:r|embed)\/[A-Za-z0-9]+[^\s"'<>]*/i);
    if (!match) return "";
    try {
      const url = new URL(match[0]);
      url.protocol = "https:";
      url.hostname = "tally.so";
      url.hash = "";
      if (url.hostname !== "tally.so" && url.hostname !== "www.tally.so") return "";
      if (!/^\/(?:r|embed)\//.test(url.pathname)) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function tallyEmbedUrl(input, campaign) {
    const normalized = normalizeTallyUrl(input);
    if (!normalized) return "";
    const url = new URL(normalized);
    url.pathname = url.pathname.replace(/^\/r\//, "/embed/");
    url.searchParams.set("alignLeft", "1");
    url.searchParams.set("hideTitle", "1");
    url.searchParams.set("transparentBackground", "1");
    if (campaign) {
      url.searchParams.set("campaign", campaign.title || "");
      url.searchParams.set("campaign_id", campaign.id || "");
    }
    return url.href;
  }

  function tallyPublicUrl(input) {
    const normalized = normalizeTallyUrl(input);
    if (!normalized) return "";
    const url = new URL(normalized);
    url.pathname = url.pathname.replace(/^\/embed\//, "/r/");
    return url.href;
  }

  async function shareFiles(files, title, text) {
    try {
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, title, text });
        return true;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return false;
    }
    return false;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.Cathen = {
    QUERY_ITERATIONS,
    ADMIN_ITERATIONS,
    IMAGE_TYPES,
    $,
    $$,
    escapeHtml,
    nowIso,
    formatDate,
    formatDeadline,
    uid,
    toast,
    openModal,
    confirmDialog,
    downloadBlob,
    downloadText,
    dataUrlToBlob,
    downloadDataUrl,
    safeFilePart,
    copyText,
    compressImage,
    randomSaltHex,
    hashSecret,
    verifySecret,
    normalizePhone,
    isValidPhone,
    normalizeCode,
    isValidCode,
    generateQueryCode,
    formatBytes,
    campaignLabel,
    safeImageSrc,
    normalizeTallyUrl,
    tallyEmbedUrl,
    tallyPublicUrl,
    shareFiles,
    getQueryParam,
    clamp
  };
})();
