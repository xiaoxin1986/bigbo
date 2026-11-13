<template>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="#feed" aria-label="BigBo 首页">
        <span class="brand__logo" aria-hidden="true">B</span>
        <span class="brand__text">
          <strong class="brand__name">BigBo</strong>
          <span class="brand__slogan">记录此刻，分享所想</span>
        </span>
      </a>
      <span class="storage-badge" title="所有内容保存在服务端内存中">
        <svg class="storage-badge__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7.5C4 5.57 7.58 4 12 4s8 1.57 8 3.5S16.42 11 12 11 4 9.43 4 7.5Z"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linejoin="round"
          />
          <path
            d="M4 7.5v9C4 18.43 7.58 20 12 20s8-1.57 8-3.5v-9"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <path
            d="M20 12c0 1.93-3.58 3.5-8 3.5S4 13.93 4 12"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        服务端存储
      </span>
    </div>
  </header>
</template>
