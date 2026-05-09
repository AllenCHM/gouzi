/**
 * 狗子官网埋点 (gouzi.xiangyagu.com)
 *
 * 上报到 goubi agent，project_tag = 'gouzi-site'，跟 APP 端 (project_tag='gouzi') 分开统计。
 *
 * 埋点：
 *  - 着陆 (landing.viewed) 带 UTM 参数 + referrer + 屏幕信息
 *  - 滚动深度 (landing.scroll) 25/50/75/100
 *  - 锚点跳转 (landing.anchor_click) #download / #features 等
 *  - CTA 点击 (landing.cta_click) data-cta 标记的元素
 *  - 下载点击 (landing.download_click) href 含 .dmg/.zip 的链接
 *  - 外站点击 (landing.outbound) 不同 host 的链接
 *  - 离开 (landing.exit) 页面停留时长 + 最大滚动深度
 *
 * 注意：
 *  - 需要 goubi agent 端配置 CORS 允许 https://gouzi.xiangyagu.com origin
 *  - 失败永不 throw，绝不破坏页面
 *  - 不上报任何用户输入文本
 */
(function () {
  'use strict'

  // ============ 配置 ============
  var ENDPOINT = 'https://goubi.xiangyagu.com/v1/events'
  var TOKEN = '83383b80cfa46c4d8d27dae75381e95b3e643a6f9c2e6d816bc5b00216c4a143'
  var PROJECT = 'gouzi-site'

  var STORAGE_DEVICE = 'gouzi-site:device_id'
  var STORAGE_FIRST_SEEN = 'gouzi-site:first_seen'
  var STORAGE_FIRST_TOUCH = 'gouzi-site:first_touch'  // 首次接触渠道（永不覆盖）
  var SESSION_ID_KEY = 'gouzi-site:session_id'

  var SCROLL_THRESHOLDS = [25, 50, 75, 100]
  var SAMPLE_SCROLL_THROTTLE_MS = 250

  // ============ helpers ============

  function uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    var d = new Date().getTime()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0
      d = Math.floor(d / 16)
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }

  function safeGet(storage, key) {
    try { return storage.getItem(key) } catch (e) { return null }
  }
  function safeSet(storage, key, val) {
    try { storage.setItem(key, val) } catch (e) {}
  }

  function getOrCreateDeviceId() {
    var v = safeGet(localStorage, STORAGE_DEVICE)
    if (v && /^[A-Za-z0-9_-]{1,64}$/.test(v)) return v
    var id = uuid()
    safeSet(localStorage, STORAGE_DEVICE, id)
    return id
  }

  function getOrCreateSessionId() {
    var v = safeGet(sessionStorage, SESSION_ID_KEY)
    if (v) return v
    var id = uuid()
    safeSet(sessionStorage, SESSION_ID_KEY, id)
    return id
  }

  // 首次访问时间，用来算 days_since_first_seen
  function ensureFirstSeen() {
    var v = safeGet(localStorage, STORAGE_FIRST_SEEN)
    if (v && !isNaN(Number(v))) return Number(v)
    var now = Date.now()
    safeSet(localStorage, STORAGE_FIRST_SEEN, String(now))
    return now
  }

  function detectOs() {
    var ua = navigator.userAgent || ''
    if (/Android/i.test(ua)) return 'Android'
    if (/(iPhone|iPad|iPod)/i.test(ua)) return 'iOS'
    if (/Mac/i.test(ua)) return 'macOS'
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Linux/i.test(ua)) return 'Linux'
    return 'unknown'
  }

  function detectDevice() {
    var ua = navigator.userAgent || ''
    if (/Mobile|Android|iPhone|iPod/i.test(ua)) return 'mobile'
    if (/iPad|Tablet/i.test(ua)) return 'tablet'
    return 'desktop'
  }

  /**
   * 渠道归因双层模型：
   *  - first_utm_*：**首次接触**渠道，写入 localStorage 后**永不覆盖**。回答"这设备最初是从哪来的"
   *  - utm_*：**本次访问**渠道（current touch）。回答"这次是从哪来的"
   *
   * 业务用法：
   *  - 转化分析（"哪个渠道带来的人最终装了 APP"）→ first_utm_source
   *  - 单次活动效果 → utm_campaign
   *  - 看回访 → first_utm_source != utm_source 的设备数
   *
   * 如果用户带了 ?utm_source=...，无 referrer 推断；否则 referrer host 推断。
   * 内部跳转（location.hostname）不算 referrer。
   */
  function parseCurrentTouch() {
    var p = new URLSearchParams(location.search)
    var ref = document.referrer || ''
    var refHost = ''
    try { refHost = ref ? new URL(ref).hostname : '' } catch (e) {}
    if (refHost === location.hostname) refHost = ''

    var t = {
      utm_source: p.get('utm_source') || '',
      utm_medium: p.get('utm_medium') || '',
      utm_campaign: p.get('utm_campaign') || '',
      utm_term: p.get('utm_term') || '',
      utm_content: p.get('utm_content') || '',
      ref_host: refHost,
      derived_source: '',
    }
    if (!t.utm_source && refHost) {
      if (/x\.com|twitter/.test(refHost)) t.derived_source = 'twitter'
      else if (/weibo\.com/.test(refHost)) t.derived_source = 'weibo'
      else if (/xiaohongshu|xhscdn/.test(refHost)) t.derived_source = 'xiaohongshu'
      else if (/zhihu\.com/.test(refHost)) t.derived_source = 'zhihu'
      else if (/v2ex\.com/.test(refHost)) t.derived_source = 'v2ex'
      else if (/bing\.com|baidu\.com|google\./.test(refHost)) t.derived_source = 'search'
      else if (/github\.com/.test(refHost)) t.derived_source = 'github'
      else if (/jike|okjike/.test(refHost)) t.derived_source = 'jike'
      else if (/bilibili/.test(refHost)) t.derived_source = 'bilibili'
      else if (/producthunt/.test(refHost)) t.derived_source = 'producthunt'
      else if (/news\.ycombinator/.test(refHost)) t.derived_source = 'hackernews'
      else t.derived_source = 'referral'
    } else if (!t.utm_source && !refHost) {
      t.derived_source = 'direct'
    }
    // 至少有一项非空才算"有效 touch"
    t._has_signal = !!(t.utm_source || t.utm_medium || t.utm_campaign || t.utm_term
      || t.utm_content || t.ref_host || (t.derived_source && t.derived_source !== 'direct'))
    return t
  }

  function captureChannel() {
    var current = parseCurrentTouch()

    // first-touch：localStorage 首次写入永不覆盖。direct（无 UTM 无 referrer）也算一次触点
    var firstRaw = safeGet(localStorage, STORAGE_FIRST_TOUCH)
    var first = null
    if (firstRaw) {
      try { first = JSON.parse(firstRaw) } catch (e) {}
    }
    if (!first) {
      first = {
        utm_source: current.utm_source,
        utm_medium: current.utm_medium,
        utm_campaign: current.utm_campaign,
        utm_term: current.utm_term,
        utm_content: current.utm_content,
        ref_host: current.ref_host,
        derived_source: current.derived_source,
        first_touch_at: new Date().toISOString(),
      }
      safeSet(localStorage, STORAGE_FIRST_TOUCH, JSON.stringify(first))
    }

    // 把 first_utm_* 和 utm_* 都拍平到一个 channel 对象里，事件 props 直接 spread
    var out = {}
    if (current.utm_source) out.utm_source = current.utm_source
    if (current.utm_medium) out.utm_medium = current.utm_medium
    if (current.utm_campaign) out.utm_campaign = current.utm_campaign
    if (current.utm_term) out.utm_term = current.utm_term
    if (current.utm_content) out.utm_content = current.utm_content
    if (current.ref_host) out.ref_host = current.ref_host
    if (current.derived_source) out.derived_source = current.derived_source

    // 首次接触字段（即使现在是 direct，这设备的 first_touch 也保留下来）
    if (first.utm_source) out.first_utm_source = first.utm_source
    if (first.utm_medium) out.first_utm_medium = first.utm_medium
    if (first.utm_campaign) out.first_utm_campaign = first.utm_campaign
    if (first.ref_host) out.first_ref_host = first.ref_host
    if (first.derived_source) out.first_derived_source = first.derived_source

    return out
  }

  // ============ 上报队列 ============

  var deviceId = getOrCreateDeviceId()
  var sessionId = getOrCreateSessionId()
  var firstSeen = ensureFirstSeen()
  var sessionStartMs = Date.now()
  var maxScrollPct = 0
  var pendingScrollEvents = {}  // {25: false, 50: false, ...}
  SCROLL_THRESHOLDS.forEach(function (t) { pendingScrollEvents[t] = false })

  var queue = []
  var sending = false

  var baseProps = {
    os: detectOs(),
    device: detectDevice(),
    screen_w: window.screen ? window.screen.width : 0,
    screen_h: window.screen ? window.screen.height : 0,
    lang: navigator.language || '',
    days_since_first_seen: Math.max(0, Math.floor((Date.now() - firstSeen) / 86400000)),
  }

  function buildEvent(name, props) {
    var channel = captureChannel()
    var merged = {}
    Object.keys(baseProps).forEach(function (k) { merged[k] = baseProps[k] })
    Object.keys(channel).forEach(function (k) { if (channel[k]) merged[k] = channel[k] })
    if (props) {
      Object.keys(props).forEach(function (k) { merged[k] = props[k] })
    }
    // module 字段让 goubi schema 提到独立列
    merged.module = 'site'

    return {
      id: uuid(),
      event_name: name,
      event_time: new Date().toISOString(),
      session_id: sessionId,
      props: merged,
      app_version: 'web',
      os: baseProps.os,
    }
  }

  function send(events, useBeacon) {
    var body = JSON.stringify(events)
    if (useBeacon && navigator.sendBeacon) {
      // sendBeacon 可靠性最高（页面 unload 也能发），但必须用 simple Content-Type 才不触发 preflight。
      // 用 Blob({type: 'text/plain'}) 让 server 端按 body 字节解析（goubi agent 兼容 raw JSON body）
      try {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
        var ok = navigator.sendBeacon(
          ENDPOINT + '?token=' + encodeURIComponent(TOKEN)
                  + '&project=' + encodeURIComponent(PROJECT)
                  + '&device=' + encodeURIComponent(deviceId),
          blob,
        )
        if (ok) return
      } catch (e) {}
    }
    // 默认走 fetch（需要 agent 端 CORS 允许 https://gouzi.xiangyagu.com origin）
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goubi-Token': TOKEN,
          'X-Project': PROJECT,
          'X-Device': deviceId,
        },
        body: body,
        // mode: 'cors' 默认。若 agent 没 CORS，浏览器会拦截但事件已发出
        keepalive: true,  // 页面卸载场景（fetch 等价 sendBeacon）
      }).catch(function () {})
    } catch (e) {}
  }

  function flush(useBeacon) {
    if (queue.length === 0) return
    var batch = queue.splice(0, 200)
    send(batch, !!useBeacon)
  }

  function track(name, props) {
    try {
      queue.push(buildEvent(name, props || {}))
      // 简单策略：每条事件入队后就尽快 flush（官网事件密度低，不做 batch 也够用）
      // unload 时统一 sendBeacon
      if (!sending) {
        sending = true
        setTimeout(function () { sending = false; flush(false) }, 200)
      }
    } catch (e) {}
  }

  // ============ 业务事件 ============

  function trackLandingViewed() {
    track('landing.viewed', {
      landing_path: location.pathname,
      title: document.title.slice(0, 80),
    })
  }

  function trackScroll() {
    var doc = document.documentElement
    var body = document.body
    var scrollTop = window.scrollY || doc.scrollTop || body.scrollTop || 0
    var winH = window.innerHeight || doc.clientHeight
    var docH = Math.max(
      body.scrollHeight, doc.scrollHeight,
      body.offsetHeight, doc.offsetHeight,
      body.clientHeight, doc.clientHeight,
    )
    var maxScroll = Math.max(0, docH - winH)
    if (maxScroll <= 0) return
    var pct = Math.min(100, Math.round((scrollTop + winH) / docH * 100))
    if (pct > maxScrollPct) maxScrollPct = pct
    SCROLL_THRESHOLDS.forEach(function (t) {
      if (!pendingScrollEvents[t] && pct >= t) {
        pendingScrollEvents[t] = true
        track('landing.scroll', { depth: t })
      }
    })
  }

  // 简单 throttle
  var scrollTimer = null
  function onScroll() {
    if (scrollTimer) return
    scrollTimer = setTimeout(function () {
      scrollTimer = null
      trackScroll()
    }, SAMPLE_SCROLL_THROTTLE_MS)
  }

  function classifyLink(a) {
    var href = a.getAttribute('href') || ''
    if (!href) return null

    // 锚点
    if (href.charAt(0) === '#') {
      return { kind: 'anchor', anchor: href.slice(1) }
    }

    // mailto
    if (/^mailto:/i.test(href)) {
      return { kind: 'mailto' }
    }

    // 解析 URL
    var url
    try { url = new URL(href, location.href) } catch (e) { return null }

    // 下载（dmg / zip / exe / appimage）
    if (/\.(dmg|zip|exe|appimage|msi)(\?.*)?$/i.test(url.pathname)) {
      return {
        kind: 'download',
        host: url.hostname,
        platform: /\.dmg$/i.test(url.pathname) ? 'macos'
          : /\.exe|\.msi$/i.test(url.pathname) ? 'windows'
          : /\.appimage$/i.test(url.pathname) ? 'linux'
          : 'other',
      }
    }

    // 外站
    if (url.hostname && url.hostname !== location.hostname) {
      return { kind: 'outbound', host: url.hostname, path: url.pathname.slice(0, 80) }
    }

    return { kind: 'internal' }
  }

  function onClick(ev) {
    // 找最近的 <a>
    var node = ev.target
    while (node && node !== document.body) {
      if (node.tagName && node.tagName.toLowerCase() === 'a') break
      node = node.parentNode
    }
    if (!node || node.tagName.toLowerCase() !== 'a') return

    var meta = classifyLink(node)
    if (!meta) return

    var ctaTag = node.getAttribute('data-cta') || ''
    var ctaSection = node.getAttribute('data-cta-section') || ''

    var props = {}
    if (ctaTag) props.cta = ctaTag
    if (ctaSection) props.section = ctaSection

    if (meta.kind === 'anchor') {
      track('landing.anchor_click', Object.assign({ anchor: meta.anchor }, props))
    } else if (meta.kind === 'download') {
      track('landing.download_click', Object.assign({
        platform: meta.platform,
        host: meta.host,
      }, props))
    } else if (meta.kind === 'outbound') {
      track('landing.outbound', Object.assign({
        host: meta.host,
        path: meta.path,
      }, props))
    } else if (meta.kind === 'mailto') {
      track('landing.mailto_click', props)
    } else if (ctaTag) {
      // internal 但被显式标了 data-cta 的，也记一下
      track('landing.cta_click', props)
    }
  }

  function onUnload() {
    var dur = Math.round((Date.now() - sessionStartMs) / 1000)
    if (dur < 1) return
    track('landing.exit', {
      duration_s: dur,
      max_scroll_depth: maxScrollPct,
    })
    // sendBeacon 兜底，确保页面卸载时事件能送到
    flush(true)
  }

  // ============ 启动 ============

  // 初始化时立即 fire landing.viewed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackLandingViewed)
  } else {
    trackLandingViewed()
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('click', onClick, { capture: true })

  // 页面卸载（关 tab / 跳转 / 后退）
  // pagehide 比 unload 更可靠（mobile safari 不一定触发 unload）
  window.addEventListener('pagehide', onUnload)
  window.addEventListener('beforeunload', onUnload)

  // 暴露调试接口
  window.__gouziTelemetry = {
    track: track,
    flush: flush,
    deviceId: deviceId,
    sessionId: sessionId,
    channel: captureChannel(),
  }
})()
