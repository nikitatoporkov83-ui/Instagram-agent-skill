/* Official Instagram connection UI. Meta tokens and secrets never enter this file. */
(() => {
  'use strict';
  globalThis.IG_INSTAGRAM = {
    create({icon,esc,toast,showDialog,getDrafts}) {
      const state = {account:null,configured:false,loaded:false,loading:false,error:'',busy:false,prepared:null,publications:[],media:[],form:{type:'IMAGE',mediaUrl:'',caption:''}};
      let popup = null, flow = null, pollTimer = null, checking = false, loginMonitor = null, loginExpiry = null;
      function clearLoginTimers() { clearInterval(loginMonitor); clearTimeout(loginExpiry); loginMonitor = null; loginExpiry = null; }
      const STATUS = {prepared:'Ожидает подтверждения',creating:'Подготовка файла',processing:'Instagram обрабатывает файл',publishing:'Отправка в Instagram',published:'Опубликовано',failed:'Не отправлено',uncertain:'Проверьте результат в Instagram'};
      const active = () => document.getElementById('instagram-page');
      function base() {
        const value = String(globalThis.IG_CONFIG?.instagramApiUrl || '').trim();
        if (!value) return '';
        try {
          const u = new URL(value), local = ['127.0.0.1','localhost'].includes(location.hostname) && ['127.0.0.1','localhost'].includes(u.hostname);
          if ((u.protocol !== 'https:' && !(local && u.protocol === 'http:')) || u.username || u.password || u.search || u.hash || u.pathname !== '/') return '';
          return u.origin;
        } catch { return ''; }
      }
      async function api(path,{method = 'GET',data} = {}) {
        const url = base();
        if (!url) throw new Error('Владелец сайта ещё не настроил подключение Instagram.');
        let response;
        try { response = await fetch(url+path,{method,credentials:'include',cache:'no-store',headers:data !== undefined ? {'Content-Type':'application/json'} : undefined,body:data !== undefined ? JSON.stringify(data) : undefined}); }
        catch { throw new Error('Сервис подключения недоступен. Проверьте соединение и повторите попытку.'); }
        let result;
        try { result = await response.json(); } catch { throw new Error('Сервис подключения вернул некорректный ответ.'); }
        if (!response.ok) {
          const error = new Error(result.error || 'Запрос не выполнен.'); error.status = response.status;
          if (response.status === 401) state.account = null;
          throw error;
        }
        return result;
      }
      function header() {
        const button = document.getElementById('instagram-header');
        if (!button) return;
        button.classList.toggle('is-connected',Boolean(state.account));
        button.setAttribute('aria-label',state.account ? `Instagram: @${state.account.username}` : 'Подключить Instagram');
        const label = button.querySelector('.instagram-header-label');
        if (label) label.textContent = state.account ? '@'+state.account.username : 'Подключить Instagram';
      }
      function html() {
        const ready = Boolean(base()) && state.configured;
        return `<div class="view-title"><div><h1>Ваш Instagram</h1><p>Готовьте публикации в студии и отправляйте их после подтверждения.</p></div><span class="badge ${state.account ? '' : 'warn'}">${state.account ? 'Аккаунт подключён' : 'Не подключён'}</span></div><section class="panel instagram-account"><div class="ig-account-icon">${icon('instagram')}</div><div class="ig-account-copy"><h2>${state.account ? '@'+esc(state.account.username) : 'Официальное подключение Instagram'}</h2><p>${state.account ? 'Профессиональный аккаунт · публикации только с вашим подтверждением' : 'Вход выполняется на странице Instagram. Сайт не запрашивает ваш пароль.'}</p></div><div class="ig-account-actions">${state.account ? `<button class="button button-secondary" data-ig-action="refresh">${icon('refresh')}Обновить</button><button class="button button-secondary" data-ig-action="disconnect">Отключить</button>` : `<button class="button button-primary" data-ig-action="connect" ${!ready || state.busy || state.loading ? 'disabled' : ''}>${icon('instagram')}${state.busy ? 'Открываем вход…' : 'Подключить Instagram'}</button>`}</div></section>${state.error ? `<div class="error-message ig-message" role="alert">${esc(state.error)}</div>` : ''}${!base() || (state.loaded && !state.configured) ? `<section class="ig-setup-note"><span>${icon('info')}</span><div><h3>Подключение ещё не активировано</h3><p>Нужна настройка официального приложения Meta и сервиса подключения. Аккаунт пока не привязан; публикации недоступны.</p><button class="section-link" data-ig-action="setup">Что нужно для подключения${icon('arrow-right')}</button></div></section>` : state.loading ? '<p class="inline-note">Проверяем подключение…</p>' : ''}${state.account ? publishing() : `<div class="ig-steps">${[['1','Войдите через Instagram','Поддерживаются профессиональные аккаунты Business и Creator.'],['2','Подготовьте публикацию','Добавьте публичную ссылку на JPEG или MP4 и свою подпись.'],['3','Проверьте и подтвердите','В Instagram ничего не отправится до нажатия «Опубликовать».']].map(([n,h,p]) => `<section><span>${n}</span><h3>${h}</h3><p>${p}</p></section>`).join('')}</div>`}`;
      }
      function publishing() {
        const f = state.form;
        return `<div class="ig-workspace"><section class="panel"><div class="panel-kicker">НОВАЯ ПУБЛИКАЦИЯ</div><h2>Последний шаг — за вами</h2><p class="panel-subtitle">Предпросмотр ничего не публикует. Сначала проверьте файл, подпись и аккаунт.</p><form id="ig-publication-form"><div class="field"><label for="ig-type">Формат</label><select id="ig-type" name="type"><option value="IMAGE" ${f.type === 'IMAGE' ? 'selected' : ''}>Фото · JPEG</option><option value="REELS" ${f.type === 'REELS' ? 'selected' : ''}>Reels · MP4</option></select></div><div class="field"><label for="ig-url">Публичная HTTPS-ссылка на файл</label><input id="ig-url" name="mediaUrl" type="url" required placeholder="https://example.com/my-photo.jpg" value="${esc(f.mediaUrl)}" maxlength="3000"><p class="field-help">Instagram должен иметь возможность скачать файл без входа и пароля. Ссылка на страницу поста не заменяет ссылку на файл.</p></div><div class="field"><div class="ig-field-heading"><label for="ig-caption">Подпись</label><button class="section-link" type="button" data-ig-action="choose-draft">Из черновика${icon('folder')}</button></div><textarea id="ig-caption" name="caption" rows="7" maxlength="8800" placeholder="Что хотите рассказать аудитории?">${esc(f.caption)}</textarea><p class="field-help"><span id="ig-caption-count">${[...f.caption].length}</span> / 2 200 символов</p></div><button class="button button-primary" type="submit" ${state.busy ? 'disabled' : ''}>${icon('reel')}${state.busy ? 'Готовим предпросмотр…' : 'Проверить перед публикацией'}</button></form></section><div><section class="panel"><h2>История отправки</h2><p class="panel-subtitle">Здесь отображаются отправки через этот сеанс студии.</p><div class="ig-publications">${state.publications.length ? state.publications.map(publicationCard).join('') : '<div class="tool-result-placeholder">'+icon('send')+'Публикаций пока нет.<br>Первую отправку подтвердите в предпросмотре.</div>'}</div></section><section class="ig-small-note">${icon('shield')}<p>Доступ хранится на сервере в зашифрованном виде. Пароль Instagram сайт не получает. Отключение удаляет сохранённый доступ и историю сервиса.</p></section>${state.media.length ? `<section class="panel ig-media-section"><h2>Последние публикации аккаунта</h2><div class="ig-media-list">${state.media.map(m => `<article><span>${esc(m.type || 'POST')}</span><p>${esc((m.caption || 'Без подписи').slice(0,180))}</p>${instagramLink(m.permalink,'Открыть в Instagram')}</article>`).join('')}</div></section>` : ''}</div></div>`;
      }
      function instagramLink(url,label) {
        if (typeof url !== 'string' || !/^https:\/\/(?:www\.)?instagram\.com\//i.test(url)) return '';
        return `<a class="section-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon('external')}</a>`;
      }
      function publicationCard(post) {
        return `<article class="ig-publication"><div><span class="badge ${post.status === 'published' ? '' : ['failed','uncertain'].includes(post.status) ? 'fail' : 'warn'}">${STATUS[post.status] || 'Проверка статуса'}</span><small>${post.type === 'REELS' ? 'REELS' : 'ФОТО'}</small></div><p>${esc((post.caption || 'Без подписи').slice(0,200))}</p>${post.error ? `<p class="ig-publication-error">${esc(post.error)}</p>` : ''}${instagramLink(post.permalink,'Открыть публикацию')}</article>`;
      }
      function paint() { const root = active(); if (root) root.innerHTML = html(); header(); }
      async function refresh() {
        if (!base() || checking) return;
        checking = true; state.loading = true; state.error = ''; paint();
        try {
          const health = await api('/health'); state.configured = health.configured === true;
          if (state.configured) {
            try {
              const me = await api('/api/me');
              if (me.connected !== true || typeof me.username !== 'string') throw new Error('Сервис не подтвердил подключение.');
              state.account = me;
              state.publications = (await api('/api/publications')).publications || [];
              try { state.media = (await api('/api/media')).media || []; } catch { state.media = []; }
            } catch (error) { if (error.status !== 401) throw error; state.account = null; }
          } else state.account = null;
        } catch (error) { state.error = error.message; }
        finally { checking = false; state.loaded = true; state.loading = false; paint(); schedulePoll(); }
      }
      function schedulePoll() {
        clearTimeout(pollTimer);
        if (!active() || !state.account || !state.publications.some(p => p.confirmedAt && ['creating','processing','publishing'].includes(p.status))) return;
        pollTimer = setTimeout(async () => {
          try {
            for (const post of state.publications.filter(p => p.confirmedAt && ['creating','processing','publishing'].includes(p.status))) {
              const updated = await api(`/api/publications/${encodeURIComponent(post.id)}/advance`,{method:'POST'});
              const index = state.publications.findIndex(p => p.id === updated.id); if (index >= 0) state.publications[index] = updated;
            }
            paint();
          } catch (error) { state.error = error.message; paint(); }
          schedulePoll();
        },5000);
      }
      async function connect() {
        if (!state.configured || state.busy) return;
        clearLoginTimers();
        popup = window.open('about:blank','insta-studio-login','popup,width=540,height=740');
        if (!popup) { toast('Разрешите открыть окно официального входа Instagram.'); return; }
        state.busy = true; state.error = ''; paint();
        try {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const encode = value => btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
          const verifier = encode(bytes), challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
          const start = await api('/oauth/start',{method:'POST',data:{challenge}});
          const authorize = new URL(start.url);
          if (authorize.origin !== 'https://www.instagram.com' || authorize.pathname !== '/oauth/authorize') throw new Error('Сервис вернул недопустимый адрес входа.');
          flow = {state:start.state,verifier};
          popup.location = authorize.href;
          loginMonitor = setInterval(() => {
            if (!popup || popup.closed) { clearLoginTimers(); flow = null; state.busy = false; paint(); }
          },1000);
          loginExpiry = setTimeout(() => { clearLoginTimers(); state.busy = false; flow = null; paint(); },10*60*1000);
        } catch (error) { clearLoginTimers(); flow = null; state.error = error.message; state.busy = false; if (popup && !popup.closed) popup.close(); paint(); }
      }
      window.addEventListener('message',async event => {
        if (!flow || event.origin !== base() || event.source !== popup || event.data?.state !== flow.state) return;
        if (!['instagram-connected','instagram-error'].includes(event.data.type)) return;
        clearLoginTimers();
        const current = flow; flow = null;
        if (event.data.type === 'instagram-error') { state.error = event.data.message || 'Вход отменён.'; state.busy = false; paint(); return; }
        try {
          await api('/oauth/complete',{method:'POST',data:{handoff:event.data.handoff,verifier:current.verifier}});
          state.busy = false; await refresh();
          if (!state.account) throw new Error('Браузер не сохранил сеанс подключения. Разрешите сохранение сессии для сервиса или откройте студию в современном браузере.');
          toast('Instagram подключён: @'+state.account.username);
        } catch (error) { state.error = error.message; state.busy = false; paint(); }
      });
      async function prepare(form) {
        if (state.busy || !state.account) return;
        state.form = Object.fromEntries(new FormData(form));
        if ([...state.form.caption].length > 2200) { toast('Сократите подпись до 2 200 символов.'); return; }
        state.busy = true; state.error = ''; paint();
        try {
          state.prepared = await api('/api/publications/prepare',{method:'POST',data:state.form});
          const p = state.prepared;
          let media = '';
          try { const u = new URL(p.mediaUrl); if (u.protocol === 'https:' && !u.username && !u.password) media = p.type === 'REELS' ? `<video class="ig-review-media" controls preload="metadata" src="${esc(u.href)}"></video>` : `<img class="ig-review-media" alt="Предпросмотр вашей публикации" src="${esc(u.href)}" referrerpolicy="no-referrer">`; } catch { /* The server validates URLs; keep the text review available. */ }
          showDialog(`<div class="dialog-heading"><h2 id="dialog-title">Проверить и опубликовать</h2><button class="icon-button" data-action="close-dialog" aria-label="Вернуться к правкам">${icon('close')}</button></div><p class="dialog-description">Публикация будет отправлена в <strong>@${esc(p.username)}</strong> после нажатия кнопки ниже.</p>${media}<div class="ig-review-caption">${esc(p.caption || 'Без подписи')}</div><p class="field-help">${p.type === 'REELS' ? 'Reels · MP4' : 'Фото · JPEG'} · ${[...p.caption].length} символов</p><div class="tool-actions"><button class="button button-primary" data-ig-action="confirm">${icon('send')}Опубликовать в @${esc(p.username)}</button><button class="button button-secondary" data-action="close-dialog">Вернуться к правкам</button></div><div id="ig-confirm-error"></div>`);
        } catch (error) { state.error = error.message; }
        finally { state.busy = false; paint(); }
      }
      async function confirm(button) {
        if (!state.prepared || state.busy) return;
        const prepared = state.prepared; state.busy = true; button.disabled = true; button.textContent = 'Отправляем…';
        try {
          const result = await api(`/api/publications/${encodeURIComponent(prepared.id)}/confirm`,{method:'POST',data:{confirm:true,confirmation:prepared.confirmation}});
          state.prepared = null;
          state.publications = [result,...state.publications.filter(p => p.id !== result.id)];
          if (result.status === 'published') { state.form = {type:'IMAGE',mediaUrl:'',caption:''}; toast('Публикация отправлена в Instagram'); }
          else if (['failed','uncertain'].includes(result.status)) state.error = result.error || 'Проверьте результат отправки.';
          else toast('Instagram обрабатывает файл. Подтверждение сохранено.');
          document.getElementById('dialog').close();
        } catch (error) {
          const target = document.getElementById('ig-confirm-error');
          if (target) target.innerHTML = `<div class="error-message ig-message">${esc(error.message)}</div>`;
          button.disabled = false; button.textContent = 'Проверить отправку';
        } finally { state.busy = false; paint(); schedulePoll(); }
      }
      function setupHelp() {
        showDialog(`<div class="dialog-heading"><h2 id="dialog-title">Как подключить аккаунт</h2><button class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div><p class="dialog-description">Для подключения нужен профессиональный аккаунт и официальный вход Instagram.</p><ol class="ig-setup-list"><li>Владелец настраивает приложение Meta и сервис подключения.</li><li>После активации нажмите «Подключить Instagram» и войдите в открывшемся окне Instagram.</li><li>Разрешите доступ к профилю и публикации контента. Каждая отправка из студии потребует вашего подтверждения.</li></ol><p class="inline-note">Пароль Instagram в студию и в чат передавать не нужно.</p><a class="button button-secondary" href="https://github.com/nikitatoporkov83-ui/Instagram-agent-skill/blob/main/INSTAGRAM_SETUP_RU.md" target="_blank" rel="noopener noreferrer">Инструкция для владельца${icon('external')}</a>`);
      }
      document.addEventListener('click',async event => {
        const b = event.target.closest('[data-ig-action]'); if (!b) return;
        const action = b.dataset.igAction;
        if (action === 'setup') setupHelp();
        if (action === 'refresh') refresh();
        if (action === 'connect') connect();
        if (action === 'confirm') confirm(b);
        if (action === 'disconnect' && !state.busy) {
          state.busy = true;
          try { const result = await api('/api/disconnect',{method:'POST'}); state.account = null; state.publications = []; state.media = []; state.prepared = null; clearTimeout(pollTimer); toast(result.revoked ? 'Instagram отключён. Сохранённый доступ удалён.' : 'Сохранённый доступ удалён. При необходимости отзовите разрешение в настройках Instagram.'); }
          catch (error) { state.error = error.message; }
          finally { state.busy = false; paint(); }
        }
        if (action === 'choose-draft') {
          const drafts = getDrafts();
          showDialog(`<div class="dialog-heading"><h2 id="dialog-title">Подпись из черновика</h2><button class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div>${drafts.length ? `<div class="ig-draft-list">${drafts.map(d => `<button data-ig-action="use-draft" data-draft-id="${esc(d.id)}">${esc(d.text.slice(0,180))}</button>`).join('')}</div>` : '<p class="dialog-description">Черновиков пока нет. Сохраните текст в студии, затем вернитесь к публикации.</p>'}`);
        }
        if (action === 'use-draft') { const draft = getDrafts().find(d => d.id === b.dataset.draftId); if (draft) { state.form.caption = draft.text; document.getElementById('dialog').close(); paint(); } }
      });
      document.addEventListener('submit',event => { if (event.target.id === 'ig-publication-form') { event.preventDefault(); prepare(event.target); } });
      document.addEventListener('input',event => {
        const el = event.target;
        if (!el.closest('#ig-publication-form')) return;
        if (['type','mediaUrl','caption'].includes(el.name)) state.form[el.name] = el.value;
        if (el.name === 'caption') { const count = document.getElementById('ig-caption-count'); if (count) count.textContent = [...el.value].length; }
      });
      return {
        render:() => `<div class="page" id="instagram-page">${html()}</div>`,
        mount:() => { header(); if (base()) refresh(); },
      };
    },
  };
})();
