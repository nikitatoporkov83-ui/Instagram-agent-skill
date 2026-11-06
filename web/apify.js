(() => {
  'use strict';
  globalThis.IG_APIFY = {create({icon,esc,toast,showDialog,onImport}) {
    const D = globalThis.IG_APIFY_DATA;
    let items = [], busy = false, error = '', sourceValue = '', accessKey = '', checked = false, ready = false;
    const selections = new Set();
    const base = () => {
      const value = globalThis.IG_CONFIG?.apifyApiUrl || globalThis.IG_CONFIG?.instagramApiUrl;
      try {
        const u = new URL(value);
        if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return '';
        return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1','localhost'].includes(u.hostname)) ? u.origin : '';
      } catch { return ''; }
    };
    const metric = value => value === null ? '—' : value.toLocaleString('ru-RU');
    const selected = () => items.filter(r => selections.has(r.id));
    function cards() {
      return items.map((r,index) => `<article class="apify-reel"><div class="apify-reel-heading"><span class="apify-reel-number">${String(index+1).padStart(2,'0')}</span><strong>${esc(r.account || 'Автор не указан')}</strong><label class="apify-select"><input type="checkbox" data-apify-select="${esc(r.id)}" ${selections.has(r.id) ? 'checked' : ''}>В подборку</label></div><p>${esc(r.captionFirstLine || 'Подпись не указана')}</p><div class="apify-metrics"><span>${metric(r.views)}<small>просмотров / воспроизведений</small></span><span>${metric(r.likes)}<small>лайков</small></span><span>${metric(r.comments)}<small>комментариев</small></span></div><div class="apify-reel-links"><a class="section-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Смотреть Reels ${icon('external')}</a>${r.videoUrl ? `<a class="section-link" href="${esc(r.videoUrl)}" target="_blank" rel="noopener noreferrer">Открыть видео ${icon('reel')}</a>` : ''}<button class="section-link" data-apify-score="${esc(r.id)}">Оценить строку подписи ${icon('spark')}</button></div></article>`).join('');
    }
    function markup() {
      return `<section class="panel apify-panel"><div class="result-topline"><span class="panel-kicker">ИСТОЧНИКИ / APIFY</span><span class="badge ${ready ? '' : 'warn'}">${busy ? 'Загрузка…' : ready ? 'Сервер настроен' : 'Импорт JSON доступен'}</span></div><h2>Reels с конкретикой</h2><p class="panel-subtitle">Загрузи результаты сбора по #gta6, посмотри ролики и собери подборку до 20 находок.</p><div class="apify-source-row"><div><label for="apify-source">Ссылка или ID Dataset, Run либо Actor</label><input id="apify-source" type="text" value="${esc(sourceValue)}" placeholder="https://console.apify.com/storage/datasets/…" maxlength="1000" autocomplete="off"></div><div><label for="apify-access">Код доступа к студии</label><input id="apify-access" type="password" value="" placeholder="Код сервера, не API-токен Apify" autocomplete="off" maxlength="256"></div></div><div class="tool-actions"><button class="button button-primary" data-apify-action="load" ${!ready || busy ? 'disabled' : ''}>${icon('download')}Загрузить из Apify</button><button class="button button-secondary" data-apify-action="file" ${busy ? 'disabled' : ''}>${icon('upload')}Импорт JSON</button><button class="section-link" data-apify-action="setup">Настройка${icon('info')}</button><input type="file" id="apify-file" class="file-input" accept=".json,application/json"></div>${!base() || (checked && !ready) ? '<p class="field-help">Онлайн-доступ ещё не настроен. Уже можно импортировать JSON из Apify: Dataset → Export → JSON.</p>' : ''}<p class="field-help">Онлайн-импорт читает результаты готового сбора; новый запуск Actor выполняется в Apify. Первая строка подписи может отличаться от хука в самом видео.</p>${error ? `<div class="error-message" role="alert">${esc(error)}</div>` : ''}${items.length ? `<div class="apify-toolbar"><span>${items.length} роликов · <strong id="apify-selected-count">${selections.size}</strong> / 20 в подборке</span><div class="tool-actions"><button class="button button-secondary button-small" data-apify-action="export">${icon('download')}Скачать подборку</button><button class="button button-secondary button-small" data-apify-action="swipe">В разбор Reels${icon('arrow-right')}</button><button class="section-link" data-apify-action="clear">Очистить</button></div></div><div class="apify-reel-grid" tabindex="0" aria-label="Результаты импорта Apify">${cards()}</div><p class="field-help">Пропуски в метриках означают, что источник не передал значение. Для относительного сравнения нужны подписчики или медиана аккаунта. Ссылки на видео могут истекать. Скачай подборку перед закрытием вкладки.</p>` : ''}</section>`;
    }
    function capture() {
      const source = document.getElementById('apify-source'), key = document.getElementById('apify-access');
      if (source) sourceValue = source.value;
      if (key?.value) { accessKey = key.value; key.value = ''; }
    }
    function paint() { const root = document.getElementById('apify-root'); if (root) root.innerHTML = markup(); }
    async function api(path,options = {}) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(),25000);
      try {
        const response = await fetch(base()+path,{...options,credentials:'omit',redirect:'error',signal:controller.signal,headers:{...options.headers}});
        let result;
        try { result = await response.json(); } catch { throw new Error('Сервер вернул некорректный ответ.'); }
        if (!response.ok) {
          if (response.status === 401) accessKey = '';
          throw new Error(result.error || 'Не удалось получить Reels.');
        }
        return result;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Попробуйте позже.');
        if (e instanceof TypeError) throw new Error('Сервер Apify недоступен. Проверьте подключение и адрес сервиса.');
        throw e;
      } finally { clearTimeout(timer); }
    }
    async function mount() {
      if (!base() || checked) return;
      checked = true;
      try { ready = !!(await api('/api/apify/status')).configured; } catch (e) { error = e.message; }
      capture(); paint();
    }
    function accept(result) {
      items = result.rows; selections.clear();
      if (!items.length) throw new Error('В выгрузке не найдено подходящих видео Instagram. Проверьте Actor и формат экспорта.');
      toast(`Загружено ${items.length} Reels. Выбери до 20 после просмотра.`);
    }
    function setup() {
      showDialog(`<div class="dialog-heading"><h2 id="dialog-title">Подключить Apify</h2><button class="icon-button" data-action="close-dialog" aria-label="Закрыть окно">${icon('close')}</button></div><div class="dialog-description"><p>Для импорта без сервера открой Dataset → Export → JSON в Apify и загрузи файл здесь.</p><p>Для онлайн-импорта владелец настраивает сервис: APIFY_API_TOKEN и APIFY_ACCESS_KEY — секреты сервера, SITE_URL — адрес студии, apifyApiUrl — публичный адрес сервиса. Код APIFY_ACCESS_KEY вводится в студии и хранится только в памяти вкладки.</p><p>Apify работает отдельно от входа в Instagram. Импорт не публикует ролики и не запускает платный сбор.</p></div>`);
    }
    async function action(name) {
      capture();
      if (name === 'setup') { setup(); return; }
      if (name === 'file') { document.getElementById('apify-file')?.click(); return; }
      if (name === 'clear') { items = []; selections.clear(); error = ''; accessKey = ''; paint(); return; }
      if (name === 'swipe') {
        try {
          const data = D.tsv(selected().length ? selected() : items);
          onImport(data.text);
          toast(`В разбор передано: ${data.imported}. Без базы: ${data.skipped}. Русских строк без оценки: ${data.omittedRussianHooks}.`);
        } catch (e) { error = e.message; paint(); }
        return;
      }
      if (name === 'export') {
        const rows = selected();
        if (!rows.length) { toast('Сначала отметь ролики для подборки.'); return; }
        const result = '# Подборка Reels — #gta6\n\nПервая строка подписи приведена отдельно; видео-хук требует просмотра.\n\n'+rows.map((r,i) => `## ${i+1}. ${r.account || 'Автор не указан'}\n\n${r.url}\n\nСтрока подписи: ${r.captionFirstLine || 'Нет данных'}\n\nПросмотры / воспроизведения: ${metric(r.views)} · Лайки: ${metric(r.likes)} · Комментарии: ${metric(r.comments)}\n`).join('\n');
        const url = URL.createObjectURL(new Blob([result],{type:'text/markdown;charset=utf-8'})), a = document.createElement('a');
        a.href = url; a.download = 'gta6-reels-shortlist.md'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); return;
      }
      if (name !== 'load' || busy || !ready) return;
      error = '';
      try {
        const source = D.source(sourceValue);
        if (!accessKey) throw new Error('Введите код доступа к студии. API-токен Apify сюда вводить не нужно.');
        if (/^apify_api_/i.test(accessKey)) { accessKey = ''; throw new Error('Это API-токен Apify. Храните его в секретах сервера, а здесь введите код APIFY_ACCESS_KEY.'); }
        busy = true; paint();
        const result = await api('/api/apify/import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessKey},body:JSON.stringify({source,limit:100})});
        accept(result);
      } catch (e) { error = e.message; }
      finally { busy = false; paint(); }
    }
    document.addEventListener('click',event => {
      const button = event.target.closest('[data-apify-action],[data-apify-score]');
      if (!button || button.disabled) return;
      if (button.dataset.apifyScore) {
        const row = items.find(r => r.id === button.dataset.apifyScore); if (!row) return;
        if (!row.captionFirstLine || /[\u0400-\u04ff]/.test(row.captionFirstLine)) { toast('Оценка структуры работает для английской строки подписи. Сам видео-хук нужно посмотреть.'); return; }
        onImport(row.captionFirstLine,'hooks'); return;
      }
      void action(button.dataset.apifyAction);
    });
    document.addEventListener('change',async event => {
      const input = event.target;
      if (input.matches('[data-apify-select]')) {
        if (input.checked && selections.size >= 20) { input.checked = false; toast('В подборке уже 20 роликов. Сначала сними одну отметку.'); return; }
        if (input.checked) selections.add(input.dataset.apifySelect); else selections.delete(input.dataset.apifySelect);
        const count = document.getElementById('apify-selected-count'); if (count) count.textContent = selections.size;
      }
      if (input.id !== 'apify-file') return;
      const file = input.files[0]; if (!file) return;
      capture(); error = '';
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error('Выберите JSON размером до 5 МБ.');
        let raw; try { raw = JSON.parse(await file.text()); } catch { throw new Error('Не удалось прочитать JSON. Экспортируйте Dataset из Apify в формате JSON.'); }
        const result = D.normalize(raw); accept(result);
        if (result.truncated) toast('Загружены первые 200 записей из файла.');
      } catch (e) { error = e.message; }
      paint();
    });
    return {render:markup,mount};
  }};
})();
