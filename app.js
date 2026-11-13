/**
 * BigBo · 极简动态时间线
 * 纯原生 JavaScript，零依赖，数据保存在 localStorage。
 *
 * 代码按职责分为四层，自上而下单向依赖：
 *   Storage  -> 本地存储读写与容错
 *   Utils    -> 时间格式化、字数统计等纯函数
 *   Render   -> 把数据渲染成 DOM
 *   Controller -> 绑定事件、编排流程
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Storage 层
   * ------------------------------------------------------------------ */

  var STORAGE_KEY = 'bigbo.posts.v1';
  var MAX_LENGTH = 280;

  /**
   * 读取全部动态。
   * 任何异常（无存储权限、JSON 损坏、结构非法）都退化为空数组，
   * 保证首页永远可以正常渲染。
   * @returns {{posts: Array, ok: boolean}}
   */
  function loadPosts() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { posts: [], ok: true };

      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { posts: [], ok: true };

      var posts = parsed.filter(function (item) {
        return (
          item &&
          typeof item.id === 'string' &&
          typeof item.content === 'string' &&
          typeof item.createdAt === 'number'
        );
      });

      return { posts: posts, ok: true };
    } catch (error) {
      return { posts: [], ok: false };
    }
  }

  /**
   * 覆盖写入全部动态。
   * @param {Array} posts
   * @returns {boolean} 是否写入成功
   */
  function savePosts(posts) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 追加一条动态并落盘。
   * @param {Array} posts 当前列表
   * @param {string} content 已清洗的正文
   * @returns {{posts: Array, post: Object, ok: boolean}}
   */
  function addPost(posts, content) {
    var post = {
      id: createId(),
      content: content,
      createdAt: Date.now()
    };
    var next = posts.concat([post]);
    return { posts: next, post: post, ok: savePosts(next) };
  }

  /* ------------------------------------------------------------------ *
   * Utils 层
   * ------------------------------------------------------------------ */

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** 按字符（而非 UTF-16 码元）统计长度，与输入框视觉反馈一致 */
  function countChars(text) {
    return Array.from(text).length;
  }

  function pad(num) {
    return num < 10 ? '0' + num : String(num);
  }

  function formatDateTime(timestamp) {
    var d = new Date(timestamp);
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    );
  }

  /**
   * 相对时间：刚刚 / n 分钟前 / n 小时前 / 昨天 / 日期
   */
  function formatRelativeTime(timestamp, now) {
    var current = typeof now === 'number' ? now : Date.now();
    var diff = Math.max(0, current - timestamp);
    var minute = 60 * 1000;
    var hour = 60 * minute;
    var day = 24 * hour;

    if (diff < minute) return '刚刚';
    if (diff < hour) return Math.floor(diff / minute) + ' 分钟前';
    if (diff < day) return Math.floor(diff / hour) + ' 小时前';
    if (diff < 2 * day) return '昨天';
    if (diff < 7 * day) return Math.floor(diff / day) + ' 天前';

    var d = new Date(timestamp);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 由 id 派生出稳定的头像渐变色，避免每次渲染颜色跳变 */
  function avatarGradient(id) {
    var hash = 0;
    for (var i = 0; i < id.length; i += 1) {
      hash = (hash * 31 + id.charCodeAt(i)) % 360;
    }
    return 'linear-gradient(135deg, hsl(' + hash + ' 82% 68%), hsl(' + ((hash + 42) % 360) + ' 78% 58%))';
  }

  /* ------------------------------------------------------------------ *
   * Render 层
   * ------------------------------------------------------------------ */

  var els = {
    input: document.getElementById('postInput'),
    publishBtn: document.getElementById('publishBtn'),
    counter: document.getElementById('counter'),
    counterValue: document.getElementById('counterValue'),
    postList: document.getElementById('postList'),
    feedCount: document.getElementById('feedCount'),
    emptyState: document.getElementById('emptyState'),
    emptyAction: document.getElementById('emptyAction'),
    toastStack: document.getElementById('toastStack')
  };

  /** 创建一条动态卡片。全部用户内容通过 textContent 写入，杜绝 XSS。 */
  function createPostNode(post) {
    var item = document.createElement('li');
    item.className = 'post-card';
    item.dataset.id = post.id;

    var head = document.createElement('div');
    head.className = 'post-card__head';

    var avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.style.background = avatarGradient(post.id);
    avatar.textContent = 'B';

    var meta = document.createElement('div');
    meta.className = 'post-card__meta';

    var author = document.createElement('span');
    author.className = 'post-card__author';
    author.textContent = 'BigBo 用户';

    var time = document.createElement('time');
    time.className = 'post-card__time';
    time.dateTime = new Date(post.createdAt).toISOString();
    time.title = formatDateTime(post.createdAt);
    time.textContent = formatRelativeTime(post.createdAt);
    time.dataset.createdAt = String(post.createdAt);

    meta.appendChild(author);
    meta.appendChild(time);
    head.appendChild(avatar);
    head.appendChild(meta);

    var content = document.createElement('p');
    content.className = 'post-card__content';
    content.textContent = post.content;

    item.appendChild(head);
    item.appendChild(content);
    return item;
  }

  function renderTimeline(posts, highlightId) {
    var ordered = posts.slice().sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

    var fragment = document.createDocumentFragment();
    ordered.forEach(function (post) {
      var node = createPostNode(post);
      if (post.id === highlightId) node.classList.add('post-card--enter');
      fragment.appendChild(node);
    });

    els.postList.textContent = '';
    els.postList.appendChild(fragment);

    var hasPosts = ordered.length > 0;
    els.emptyState.hidden = hasPosts;
    els.postList.hidden = !hasPosts;
    els.feedCount.textContent = ordered.length + ' 条';
  }

  /** 已渲染的相对时间每 60 秒刷新一次，无需整列表重绘 */
  function refreshTimes() {
    var times = els.postList.querySelectorAll('time[data-created-at]');
    Array.prototype.forEach.call(times, function (node) {
      var createdAt = Number(node.dataset.createdAt);
      node.textContent = formatRelativeTime(createdAt);
    });
  }

  var toastTimer = null;

  function showToast(message, type) {
    if (!els.toastStack) return;
    if (toastTimer) window.clearTimeout(toastTimer);

    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'success');
    toast.textContent = message;

    els.toastStack.textContent = '';
    els.toastStack.appendChild(toast);

    // 触发入场过渡
    window.requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });

    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
      window.setTimeout(function () {
        if (toast.parentNode === els.toastStack) els.toastStack.textContent = '';
      }, 240);
    }, 2400);
  }

  /* ------------------------------------------------------------------ *
   * Controller 层
   * ------------------------------------------------------------------ */

  var state = { posts: [] };

  function syncComposer() {
    var raw = els.input.value;
    var length = countChars(raw);
    els.counterValue.textContent = String(length);

    els.counter.classList.toggle('counter--warn', length >= MAX_LENGTH * 0.85 && length < MAX_LENGTH);
    els.counter.classList.toggle('counter--limit', length >= MAX_LENGTH);

    var canPublish = raw.trim().length > 0 && length <= MAX_LENGTH;
    els.publishBtn.disabled = !canPublish;
  }

  function handlePublish() {
    var raw = els.input.value;
    var content = raw.trim();

    if (!content) {
      showToast('先写点什么再发布吧', 'error');
      els.input.focus();
      return;
    }
    if (countChars(content) > MAX_LENGTH) {
      showToast('内容超出 ' + MAX_LENGTH + ' 字上限', 'error');
      return;
    }
    if (els.publishBtn.disabled) return;

    els.publishBtn.disabled = true;

    try {
      var result = addPost(state.posts, content);

      if (!result.ok) {
        showToast('本地存储不可用，内容未能保存', 'error');
        return;
      }

      state.posts = result.posts;
      renderTimeline(state.posts, result.post.id);

      els.input.value = '';
      syncComposer();
      showToast('发布成功', 'success');

      var firstCard = els.postList.firstElementChild;
      if (firstCard && typeof firstCard.scrollIntoView === 'function') {
        firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } finally {
      syncComposer();
    }
  }

  function bindEvents() {
    els.input.addEventListener('input', syncComposer);

    els.input.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handlePublish();
      }
    });

    els.publishBtn.addEventListener('click', handlePublish);

    if (els.emptyAction) {
      els.emptyAction.addEventListener('click', function () {
        els.input.focus();
        els.input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    window.setInterval(refreshTimes, 60 * 1000);
  }

  function init() {
    var loaded = loadPosts();
    state.posts = loaded.posts;

    renderTimeline(state.posts);
    syncComposer();
    bindEvents();

    if (!loaded.ok) {
      showToast('读取本地数据失败，已从空白开始', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
