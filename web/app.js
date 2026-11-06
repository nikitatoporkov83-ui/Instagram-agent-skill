(() => {
  'use strict';
  function initialize() {
  const D = globalThis.IG_DATA, E = globalThis.IG_ENGINE;
  const PAGES = ['overview','studio','library','voice','drafts','plan','instagram'];
  const locationPage = () => PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  let currentPage = locationPage();
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    instagram:'<rect x="3" y="3" width="18" height="18" rx="6"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    reel:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M8 3l4 6m3-6 4 6"/><path d="m10 13 5 3-5 3z"/>',
    layers:'<rect x="7" y="3" width="14" height="14" rx="3"/><path d="M17 17v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3h1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
    folder:'<path d="M3 7a3 3 0 0 1 3-3h4l3 3h5a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z"/>',
    voice:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
    'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external:'<path d="M14 3h7v7m0-7L10 14m0-11H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4"/>',
    github:'<path d="M9 19c-4 1-4-2-6-2m12 4v-3.4a3 3 0 0 0-.8-2.3c2.8-.3 5.8-1.4 5.8-6A4.7 4.7 0 0 0 19 6c.3-1 .3-2.1-.1-3 0 0-1.1-.4-3.5 1.3a12 12 0 0 0-6.8 0C6.2 2.6 5.1 3 5.1 3c-.4.9-.4 2-.1 3A4.7 4.7 0 0 0 4 9.3c0 4.6 3 5.7 5.8 6A3 3 0 0 0 9 17.6V21"/>',
    chevrons:'<path d="m8 8 4-4 4 4m-8 8 4 4 4-4"/>',
    home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-8h6v8"/>',
    shield:'<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    story:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M10 19h4"/>',
    chart:'<path d="M3 3v18h18M7 16l4-5 4 2 6-9"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6m-5 4a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
    chat:'<path d="M21 12a8 8 0 0 1-8 8H6l-4 2 2-6v-4a8 8 0 0 1 17 0z"/><path d="M8 11h8m-8 4h5"/>',
    send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    wand:'<path d="m4 20 13-13 3 3L7 23zM4 4v4M2 6h4m13-5v4m-2-2h4m0 12v4m-2-2h4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  function hydrate(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  const storageKey = 'instagram-studio.v1';
  let storageAvailable = true;
  let state = {profile:{}, drafts:[], plan:[]};
  try { const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); state = {profile:saved.profile && typeof saved.profile === 'object' && !Array.isArray(saved.profile) ? saved.profile : {}, drafts:Array.isArray(saved.drafts) ? saved.drafts : [], plan:Array.isArray(saved.plan) ? saved.plan : []}; } catch { storageAvailable = false; }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; return true; }
    catch { storageAvailable = false; toast('Хранилище браузера недоступно. Скачайте результат, чтобы сохранить его.'); return false; }
  }
  const skills = [
    ['ig-reel','Reels, которые досматривают','Хуки, сценарий, экранный текст и тайминг — от идеи до съёмки.','reel','Контент','26 формул хуков'],
    ['ig-caption','Подпись со смыслом','Первая строка, поисковые фразы и один понятный призыв.','text','Контент','Проверка до публикации'],
    ['ig-carousel','Карусель по слайдам','Обложка, последовательность идей и финальный призыв.','layers','Контент','6–10 слайдов'],
    ['ig-story','Stories на каждый день','Кадры, стикеры и диалог с вашей аудиторией.','story','Контент','3–7 кадров'],
    ['ig-human','Ваш текст, живой голос','Очистка типографики и проверка текстовых шаблонов.','wand','Контент','154 слова и выражения'],
    ['ig-viral','Что работает в нише','Разберите чужие Reels по результату относительно их аккаунта.','chart','Стратегия','Анализ таблицы TSV'],
    ['ig-plan','План на неделю','Соберите темы, форматы и действия в один рабочий план.','calendar','Стратегия','Ваша система контента'],
    ['ig-profile','Профиль, который объясняет','Оцените шапку, закрепы и оформление по 12 критериям.','user','Стратегия','Рубрика на 100 баллов'],
    ['ig-comment','Комментарии по делу','Добавьте мнение, опыт или полезный вопрос к чужой публикации.','chat','Общение','9 типов комментариев'],
    ['ig-reply','Ответы вашей аудитории','Вопросы, поддержка и потенциальные клиенты в одном потоке.','chat','Общение','Ответ с контекстом'],
    ['ig-dm','Личные сообщения','Подготовьте доставку обещанного, предложение или продолжение диалога.','send','Общение','Текст, который можно отправить'],
    ['ig-repurpose','Одна идея — разные форматы','Найдите в большом материале самостоятельные Reels и карусели.','refresh','Контент','Из длинного в короткое'],
    ['ig-audit','Разбор ваших публикаций','Сравните результаты и найдите темы, которые стоит развивать.','target','Стратегия','На основе ваших данных'],
  ].map((r, i) => ({id:r[0], title:r[1], description:r[2], icon:r[3], category:r[4], tag:r[5], index:i}));
  const skillById = id => skills.find(s => s.id === id);
  const TOOL_NAMES = {hooks:'Хуки', beats:'Сценарий', caption:'Подпись', human:'Редактор текста', swipe:'Разбор Reels'};
  const CHECK_NAMES = {LENGTH:'Длина',SPECIFICITY:'Конкретика',STAKES:'Напряжение',FRONTLOAD:'Суть в начале',ADDRESS:'Обращение',BURSTINESS:'Ритм','SLOP DENSITY':'Клише',FINGERPRINT:'Типографика',VOICE:'Голос'};
  const CAPTION_CHECKS = {LENGTH:'Длина подписи','FIRST LINE':'Первая строка','HOOK IS CONCRETE':'Конкретный хук',HASHTAGS:'Хештеги','TAG PLACEMENT':'Расположение тегов',LINKS:'Ссылки','ONE ASK':'Один призыв',EMOJI:'Эмодзи','SEARCH TERMS':'Поисковые фразы'};
  const DEFAULTS = {
    hooks:'Nobody tells you that your first 3 GTA VI breakdowns need work.\nStop posting GTA VI rumors without checking 3 sources.\nHey guys, today I wanted to talk about GTA VI',
    beats:'Stop posting GTA VI rumors without checking 3 sources.\nStart with the official Rockstar trailer.\nWrite down the timestamp for every claim.\nSeparate what you can see from what you assume.\nOne frame can start a theory.\nOne theory is not a confirmed feature.\nSave your 3 sources before you publish.\nThat is your next GTA VI breakdown.',
    caption:'Your next GTA VI theory needs 3 sources.\n\nA useful GTA VI trailer breakdown separates confirmed details from speculation. Link every claim to an official trailer timestamp and label the rest as a theory. Save this.\n\n#GTAVI #ViceCity #RockstarGames',
    human:'We\u200b delve into “Vice City”—and leverage a robust, seamless breakdown. Check 3 sources before you publish a GTA VI theory. You can use this checklist. It\'s not just a trailer, it\'s a game-changer.\n\nRead https://example.com/leverage before your next breakdown.',
    swipe:'account\tfollowers\tmedian\tviews\thook\n@studio_a\t4000\t1000\t60000\tNobody tells you that your first 3 GTA VI breakdowns need work.\n@studio_b\t2000000\t900000\t1200000\tIn this video I show you a GTA VI trailer.\n@studio_c\t48000\t11000\t412500\tSteal this three-source GTA VI checklist.',
  };
  let inputs = {...DEFAULTS}, activeTool = 'hooks', toolResults = {}, toolExports = {}, libraryFilter = 'Все', librarySearch = '', overviewText = DEFAULTS.hooks.split('\n')[0], lastExport = '', briefText = '', profileTimer;
  let toastTimer;
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3600); }
  function download(name, content, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([content], {type})); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  async function copy(text) {
    try { if (!navigator.clipboard || !window.isSecureContext) throw new Error(); await navigator.clipboard.writeText(text); }
    catch { const el = document.createElement('textarea'); el.value = text; el.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(el); el.select(); const copied = document.execCommand('copy'); el.remove(); if (!copied) { toast('Выделите текст и скопируйте его вручную.'); return; } }
    toast('Скопировано');
  }
  function languageNote(text = 'Оценка стиля и хуков рассчитана на английский текст. Русские черновики можно сохранять и использовать в брифах.') { return `<div class="language-note">${icon('info')}<span>${esc(text)}</span></div>`; }
  function errorHtml(message) { return `<div class="error-message" role="alert">${esc(message)}</div>`; }
  function requireEnglish(text) { if (E.hasCyrillic(text)) throw new Error('Этот анализатор рассчитан на английский. Для русского текста пока доступны брифы, черновики и очистка типографики.'); }
  function validateText(text) { if (!text.trim()) throw new Error('Сначала добавьте текст или загрузите пример.'); if (text.length > 100000) throw new Error('Слишком большой текст. Используйте не более 100 000 символов.'); }
  function scoreHtml(result, compact = false) {
    const v = result.verdict;
    const title = v === 'STRONG' ? 'Сильный хук' : v === 'OK' ? 'Есть потенциал' : 'Хук стоит усилить';
    return `<div class="score-heading"><div class="score-disc"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="none" stroke="#eee8f5" stroke-width="4"/><circle cx="40" cy="40" r="34" fill="none" stroke="#b4a0d7" stroke-width="4" stroke-linecap="round" stroke-dasharray="${Math.PI * 68}" stroke-dashoffset="${Math.PI * 68 * (1 - result.score / 100)}"/></svg><strong>${Math.round(result.score)}</strong></div><div><h3>${title}</h3><p>из 100 · ${compact ? '5 свойств хорошего начала' : 'Оценка структуры, а не прогноз просмотров'}</p></div></div><div class="score-bars">${Object.entries(result.checks).map(([key, value]) => `<div class="score-row"><span>${CHECK_NAMES[key] || esc(key)}</span><div class="score-track"><i style="width:${value.score}%"></i></div><span class="score-value">${Math.round(value.score)}</span></div>`).join('')}</div>`;
  }
  function pageTitle(title, subtitle, action = '') { return `<div class="view-title"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
  function viceCityHero() {
    return `<section class="hero vice-hero">
      <div class="hero-channel"><span><i></i> INSTA.STUDIO / AFTER HOURS</span><span>VICE CITY EDITION <b>06</b></span></div>
      <div class="hero-copy">
        <div class="hero-tag">НЕОН. ДРАЙВ. НОВЫЙ КАДР.</div>
        <h1><span class="hero-origin">Из Vice City —</span><span class="hero-destination">прямо<br><span>в ленту.</span></span></h1>
        <p class="hero-description">Лови детали GTA VI. Собирай истории.<br>Превращай находки в Reels, которые цепляют<br class="desktop-break"> с первого кадра.</p>
        <div class="hero-actions"><button class="button button-dark" data-route="studio">${icon('plus')}Запустить идею</button><button class="button button-secondary" data-route="library">Выбрать формат${icon('arrow-right')}</button></div>
      </div>
      <div class="scene-caption" aria-hidden="true"><span class="scene-crosshair"></span><span>LEONIDA AT DUSK<br><b>NO FILTER. ALL ATMOSPHERE.</b></span></div>
      <button class="next-stop" data-route="plan"><span class="next-stop-icon">${icon('calendar')}</span><span><small>СЛЕДУЮЩАЯ ОСТАНОВКА</small><strong>План на неделю</strong></span>${icon('arrow-right')}</button>
      <div class="hero-mileage" aria-hidden="true"><span>01 — ИДЕЯ</span><i></i><span>02 — КАДР</span><i></i><span>03 — ПУБЛИКАЦИЯ</span></div>
    </section>`;
  }
  function overview() {
    return `<div class="page overview-page">${viceCityHero()}<div class="stats-grid">${[['layers','13','навыков для контента'],['spark','26','формул сильного хука'],['wand','6','локальных инструментов'],['shield','100%','локальный анализ']].map(([i, n, t]) => `<div class="stat-card"><span class="stat-icon">${icon(i)}</span><div class="stat-text"><strong>${n}</strong><span>${t}</span></div></div>`).join('')}</div><section><div class="section-header"><div><h2>Выбери следующий ход</h2><p>У каждой идеи свой маршрут. С какого начнём?</p></div><button class="section-link" data-route="library">Все навыки ${icon('arrow-right')}</button></div><div class="format-grid">${[['reel','Reels','Сценарий, который хочется досмотреть.','26 формул хуков','ig-reel'],['layers','Карусель','Идеи, которые сохраняют и пересылают.','Слайд за слайдом','ig-carousel'],['text','Подпись','Нужные слова под вашим контентом.','До 2 200 символов','ig-caption'],['story','Stories','Ближе к людям. Каждый день.','От 3 до 7 кадров','ig-story']].map(([i, t, p, tag, id], index) => `<button class="format-card" data-skill="${id}" data-mission="${String(index + 1).padStart(2, '0')}"><span class="format-icon">${icon(i)}</span><h3>${t}</h3><p>${p}</p><div class="format-card-footer"><span>${tag}</span>${icon('arrow-right')}</div></button>`).join('')}</div></section><section class="demo-section"><div class="section-header"><div><h2>Первый кадр решает</h2><p>Проверьте первую строку, прежде чем нажать «запись».</p></div><span class="pill"><span class="pill-dot"></span>Живая демонстрация</span></div><div class="demo-box"><div class="demo-editor"><div class="panel-kicker">СТУДИЯ REELS</div><h3>Как начнётся твой разбор GTA VI?</h3><label class="hidden" for="overview-hook">Текст хука на английском</label><textarea id="overview-hook" spellcheck="false">${esc(overviewText)}</textarea><div class="input-caption"><span>Одна строка. Конкретная мысль. Ваш голос.</span><span id="overview-count">${E.wordList(overviewText).length} слов</span></div><div class="demo-bottom"><button class="button button-primary" data-action="overview-analyze">${icon('spark')}Проверить хук ${icon('arrow-right')}</button><span>Анализ на английском · без регистрации</span></div></div><div class="demo-result" id="overview-analysis">${scoreHtml(E.hook(DEFAULTS.hooks.split('\n')[0]), true)}</div></div></section><section class="week-section"><div class="section-header"><div><h2>Маршрут на эту неделю</h2><p>Пример недели, в которой каждый формат делает своё дело.</p></div><button class="section-link" data-route="plan">Мой план ${icon('arrow-right')}</button></div><div class="week-preview">${[['ПОНЕДЕЛЬНИК','Разберите кадр из трейлера','REELS'],['СРЕДА','Теория или факт? Разложите по полочкам','КАРУСЕЛЬ'],['ПЯТНИЦА','Покажите, как монтируете Reels','STORIES'],['ВОСКРЕСЕНЬЕ','Соберите находки недели','ПОСТ']].map(([d, t, f]) => `<button class="week-mini" data-route="plan"><small>${d}</small><strong>${t}</strong><span>${f}</span></button>`).join('')}</div></section></div>`;
  }

  function toolEditor() {
    const tool = activeTool;
    const title = {hooks:'Первые секунды решают',beats:'Сценарий в вашем ритме',caption:'Слова под публикацией',human:'Снимите лишний слой',swipe:'Сравнивайте по делу'}[tool];
    const sub = {hooks:'Один вариант на строку. Инструмент сравнит пять свойств каждого хука.',beats:'Одна строка — один кадр. Проверьте длительность и структуру ролика.',caption:'Посмотрите, что зритель увидит до «ещё», и проверьте подпись.',human:'Очистите невидимые символы, типографику и английские клише.',swipe:'Добавьте вручную собранные данные. Сравним Reels с обычным результатом их аккаунтов.'}[tool];
    return `<div class="panel"><div class="result-topline"><span class="panel-kicker">${TOOL_NAMES[tool].toUpperCase()}</span><button class="section-link" data-action="load-example">${icon('refresh')}Пример</button></div><h2>${title}</h2><p class="panel-subtitle">${sub}</p><label for="tool-text">${tool === 'swipe' ? 'Таблица TSV' : tool === 'hooks' ? 'Варианты хука на английском' : tool === 'beats' ? 'Текст сценария на английском' : tool === 'caption' ? 'Ваша подпись' : 'Исходный текст'}</label><textarea id="tool-text" class="tool-textarea ${tool === 'swipe' ? 'code-input' : ''}" spellcheck="false">${esc(inputs[tool])}</textarea>${tool === 'beats' ? '<div class="fields-row"><div><label for="wpm">Темп, слов в минуту</label><input id="wpm" type="number" min="1" max="1000" value="165"></div><div><label for="target">Цель, секунд</label><input id="target" type="number" min="1" max="600" value="30"></div></div>' : ''}${tool === 'caption' ? '<div class="field"><label for="keywords">Поисковые фразы через запятую</label><input id="keywords" placeholder="GTA VI, Vice City" value="GTA VI"></div>' : ''}${tool === 'swipe' ? '<p class="field-help">Столбцы: account, followers, median, views, hook. Разделитель — табуляция. Числа записывайте целиком: 12000.</p><input id="tsv-file" class="file-input" type="file" accept=".tsv,.txt,text/tab-separated-values">' : ''}${languageNote(tool === 'human' ? 'Очистка типографики работает с русским текстом. Словарь клише и оценка стиля рассчитаны на английский.' : tool === 'swipe' ? 'Числа в примере синтетические. Замените их данными ваших аккаунтов. Классификация хуков рассчитана на английский.' : undefined)}<div class="tool-actions"><button class="button button-primary" data-action="analyze">${icon(tool === 'human' ? 'wand' : 'spark')}${{hooks:'Оценить хуки',beats:'Рассчитать тайминг',caption:'Проверить подпись',human:'Очистить текст',swipe:'Разобрать Reels'}[tool]}</button>${tool === 'hooks' ? `<button class="button button-secondary" data-action="formulas">${icon('layers')}26 формул</button>` : tool === 'swipe' ? `<button class="button button-secondary" data-action="upload-tsv">${icon('upload')}Загрузить TSV</button>` : ''}<button class="button button-secondary" data-action="save-draft">${icon('save')}В черновики</button></div><p class="inline-note">${tool === 'swipe' ? 'Инструмент анализирует вашу таблицу и не собирает данные из аккаунтов.' : 'Текст обрабатывается только в вашем браузере.'}</p></div>`;
  }
  function studio() {
    return `<div class="page">${pageTitle('Студия контента','Отшлифуйте идею перед тем, как она станет публикацией.',`<button class="button button-secondary" data-action="skill-brief" data-id="ig-reel">${icon('spark')}Собрать бриф</button>`)}<div class="tabs" role="tablist" aria-label="Инструменты контента">${Object.entries(TOOL_NAMES).map(([key, text]) => `<button role="tab" aria-selected="${key === activeTool}" class="tab ${key === activeTool ? 'active' : ''}" data-tool="${key}">${icon({hooks:'spark',beats:'reel',caption:'text',human:'wand',swipe:'chart'}[key])}${text}</button>`).join('')}</div>${activeTool === 'swipe' ? `<div id="apify-root">${apify.render()}</div>` : ''}<div class="tool-layout">${toolEditor()}<section class="panel tool-result" id="tool-result" aria-live="polite">${toolResults[activeTool] || '<div class="tool-result-placeholder">' + icon('spark') + 'Здесь появится результат.<br>Нажмите кнопку анализа, чтобы начать.</div>'}</section></div></div>`;
  }
  function analyze() {
    const text = $('#tool-text').value; inputs[activeTool] = text;
    try {
      validateText(text);
      let html;
      if (activeTool === 'hooks') {
        requireEnglish(text);
        const rows = text.split('\n').map(x => x.trim()).filter(Boolean).map(E.hook).sort((a, b) => b.score - a.score);
        const best = rows[0]; lastExport = rows.map(r => `${r.score} ${r.verdict}\n${r.hook}`).join('\n\n');
        html = `<div class="panel-kicker">ВАШ ЛУЧШИЙ ВАРИАНТ</div>${scoreHtml(best)}<blockquote class="result-quote">${esc(best.hook)}</blockquote>${rows.length > 1 ? `<div class="hook-ranking"><span class="panel-kicker">СРАВНЕНИЕ ВАРИАНТОВ</span>${rows.map(r => `<div class="ranking-row"><strong>${r.score}</strong><p>${esc(r.hook)}</p></div>`).join('')}</div>` : ''}<p class="result-summary">${best.verdict === 'STRONG' ? 'В начале есть конкретика и причина досмотреть. Проверьте, что остальной сценарий выполняет это обещание.' : 'Попробуйте добавить конкретную деталь и перенести её ближе к началу.'} Оценка не прогнозирует просмотры.</p>`;
      } else if (activeTool === 'beats') {
        requireEnglish(text);
        const data = E.beats(text, Number($('#wpm').value), Number($('#target').value));
        lastExport = data.beats.map(r => `${timecode(r.start)} (${r.dur} сек.) ${r.label}\n${r.text}`).join('\n\n');
        html = `<div class="panel-kicker">МОНТАЖНЫЙ ЛИСТ</div><div class="big-metric">${data.total_seconds}<small>секунд</small></div><p class="panel-subtitle">${data.total_words} слов · ${data.beats.length} кадров · ${data.wpm} слов/мин</p>${data.beats.map(r => `<div class="beat-row"><time>${timecode(r.start)}</time><div><p>${esc(r.text)}</p><small>${r.label}${r.flags.length ? ' · ' + esc(r.flags.join(' · ')) : ''}</small></div><span>${r.dur} сек.</span></div>`).join('')}<ul class="notes-list">${data.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
      } else if (activeTool === 'caption') {
        requireEnglish(text);
        const data = E.caption(text, 125, $('#keywords').value.split(',')); lastExport = text;
        html = `<div class="result-topline"><span class="panel-kicker">ЧТО ВИДНО В ЛЕНТЕ</span><span class="badge ${data.verdict === 'FIX' ? 'fail' : data.verdict === 'REVIEW' ? 'warn' : ''}">${{READY:'Готово',REVIEW:'Проверьте',FIX:'Нужны правки'}[data.verdict]}</span></div><div class="caption-preview">${esc(data.visible)}${data.truncated ? '<small>… ещё</small>' : ''}</div><p class="field-help">Обрезка на 125 символах приблизительная и зависит от устройства.</p><div class="check-list">${data.checks.map(c => `<div class="check-item ${c.status === 'WARN' ? 'warn' : c.status === 'FAIL' ? 'fail' : ''}"><span>${icon(c.status === 'PASS' ? 'check' : 'info')}</span><div><strong>${CAPTION_CHECKS[c.check]}</strong><p>${esc(c.detail)}</p></div></div>`).join('')}</div>`;
      } else if (activeTool === 'human') {
        const data = E.humanize(text); lastExport = data.text;
        const total = key => data.report[key].reduce((s, h) => s + h.count, 0);
        html = `<div class="result-topline"><span class="panel-kicker">ТЕКСТ ПОСЛЕ ОЧИСТКИ</span><span class="badge">Готово</span></div><label class="hidden" for="clean-result">Очищенный текст</label><textarea id="clean-result" class="clean-output" readonly>${esc(data.text)}</textarea><div class="report-summary">${[['invisible','невидимых символов'],['typographic','правок типографики'],['lexical','замен клише']].map(([k, label]) => `<div class="report-stat"><strong>${total(k)}</strong>${label}</div>`).join('')}</div>`;
        if (!E.hasCyrillic(text)) {
          const before = E.detect(text), after = E.detect(data.text);
          html += `<p class="result-summary">Локальная оценка стиля: ${before.human_score} → ${after.human_score} / 100. Это текстовые эвристики, а не гарантия результата сторонних детекторов.</p>`;
        }
        if (data.report.structures.length) html += `<div class="report-flags">Конструкций для ручной проверки: ${data.report.structures.length}.<ul>${data.report.structures.map(f => `<li>${esc(f.name)}</li>`).join('')}</ul></div>`;
      } else {
        const data = E.swipe(text); lastExport = E.swipeMarkdown(data);
        html = `<div class="result-topline"><span class="panel-kicker">РЕЗУЛЬТАТ РАЗБОРА</span><span class="badge">${data.n} Reels</span></div><p class="panel-subtitle">Сортировка по отношению просмотров к ${data.baseline === 'account median' ? 'медиане аккаунта' : 'числу подписчиков'}. Аккаунтов: ${data.accounts}.</p><div class="table-wrap"><table><thead><tr><th>Аккаунт</th><th>Просмотры</th><th>К базе</th></tr></thead><tbody>${data.reels.map(r => `<tr><td>${esc(r.account)}<small>${esc(r.formula)}</small></td><td>${r.views.toLocaleString('ru-RU')}<small>база ${r.baseline.toLocaleString('ru-RU')}</small></td><td><strong>${r.outlier ?? '?'}×</strong></td></tr>`).join('')}</tbody></table></div><p class="result-summary">Небольшая выборка помогает сформулировать гипотезу. Используйте больше публикаций, прежде чем делать выводы.</p>`;
      }
      html += `<div class="tool-actions"><button class="button button-secondary" data-action="copy-result">${icon('copy')}Копировать</button><button class="button button-secondary" data-action="download-result">${icon('download')}Скачать</button></div>`;
      toolResults[activeTool] = html; toolExports[activeTool] = lastExport; $('#tool-result').innerHTML = html;
    } catch (e) { $('#tool-result').innerHTML = errorHtml(e.message); }
  }
  const timecode = n => `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`;
  function library() {
    return `<div class="page">${pageTitle('13 способов сделать лучше','Инструменты для вашего контента, аудитории и стратегии.')}<div class="library-toolbar"><div class="search-box"><span>${icon('search')}</span><label class="hidden" for="skill-search">Поиск по навыкам</label><input id="skill-search" placeholder="Найти свой инструмент…" value="${esc(librarySearch)}" autocomplete="off"></div><div class="filter-tabs" aria-label="Фильтры навыков">${['Все','Контент','Общение','Стратегия'].map(f => `<button class="filter-button ${libraryFilter === f ? 'active' : ''}" data-filter="${f}">${f}</button>`).join('')}</div></div><div id="skill-cards">${libraryCards()}</div></div>`;
  }
  function libraryCards() {
    const query = librarySearch.trim().toLowerCase();
    const list = skills.filter(s => (libraryFilter === 'Все' || s.category === libraryFilter) && `${s.title} ${s.description} ${s.id}`.toLowerCase().includes(query));
    return `<div class="skill-grid">${list.map(s => `<button class="skill-card" data-skill="${s.id}" style="--tint:${['#f1ecfb','#f9ede6','#eaf4ee','#f9f3df'][s.index % 4]};--accent:${['#b19acd','#d1ab92','#a1b9ab','#c7b77e'][s.index % 4]}"><div class="skill-card-head"><span class="format-icon">${icon(s.icon)}</span><span class="skill-slug">/${s.id}</span></div><h3>${s.title}</h3><p>${s.description}</p><div class="skill-card-bottom"><span>${s.tag}</span>${icon('arrow-right')}</div></button>`).join('')}</div>${list.length ? `<p class="skill-count">Показано ${list.length} из 13 навыков</p>` : '<div class="empty-state"><span class="empty-icon">' + icon('search') + '</span><h2>Пока ничего не нашлось</h2><p>Попробуйте другое слово или выберите категорию «Все».</p></div>'}`;
  }
  function openSkill(id, forceBrief = false) {
    if (!forceBrief && ['ig-reel','ig-caption','ig-human','ig-viral'].includes(id)) {
      activeTool = {'ig-reel':'hooks','ig-caption':'caption','ig-human':'human','ig-viral':'swipe'}[id]; route('studio'); return;
    }
    if (!forceBrief && id === 'ig-plan') { route('plan'); return; }
    const skill = skillById(id); if (!skill) return;
    const profile = state.profile;
    showDialog(`<div class="dialog-heading"><h2 id="dialog-title">${skill.title}</h2>${closeButton()}</div><p class="dialog-description">${skill.description} Подготовьте бриф, который можно передать вашему AI-агенту.</p><form id="brief-form" class="dialog-form" data-skill-id="${id}"><div class="field"><label for="brief-context">Идея, материал или задача</label><textarea id="brief-context" name="context" required maxlength="30000" placeholder="Расскажите, что хотите сделать. Добавьте реальные факты, текст или результаты."></textarea></div><div class="fields-row"><div><label for="brief-audience">Для кого</label><input id="brief-audience" name="audience" value="${esc(profile.audience || '')}" placeholder="Ваша аудитория" maxlength="2000"></div><div><label for="brief-goal">Что должен получить зритель</label><input id="brief-goal" name="goal" placeholder="Идею, ответ, инструкцию…" maxlength="2000"></div></div><button class="button button-primary" type="submit">${icon('spark')}Подготовить бриф</button></form><div id="brief-output"></div>`);
  }
  function showDialog(html) { $('#dialog-content').innerHTML = html; $('#dialog').showModal(); }
  function optionalIntegration(namespace, title, options, fullPage = false) {
    let instance;
    function get() {
      if (namespace === 'IG_APIFY' && !globalThis.IG_APIFY_DATA) return null;
      if (!instance && typeof globalThis[namespace]?.create === 'function') {
        try { instance = globalThis[namespace].create(options); } catch { /* Offer recovery inside the affected section. */ }
      }
      return instance;
    }
    function unavailable() {
      const reload = new URL(location.href);
      reload.searchParams.set('reload',String(Date.now()));
      reload.hash = currentPage;
      const message = `<section class="panel"><h2>${title}</h2><p class="panel-subtitle">Не удалось загрузить раздел. Проверьте соединение и повторите загрузку.</p><a class="button button-secondary" href="${esc(reload.href)}">${icon('refresh')}Повторить загрузку</a></section>`;
      return fullPage ? `<div class="page">${pageTitle(title,'Повторите загрузку раздела.')}${message}</div>` : message;
    }
    return {
      render() { try { return get()?.render() || unavailable(); } catch { return unavailable(); } },
      mount() { try { Promise.resolve(get()?.mount()).catch(() => toast('Не удалось обновить раздел. Повторите загрузку.')); } catch { toast('Не удалось обновить раздел. Повторите загрузку.'); } },
    };
  }
  const instagram = optionalIntegration('IG_INSTAGRAM','Подключение Instagram',{icon,esc,toast,showDialog,getDrafts:() => state.drafts},true);
  const apify = optionalIntegration('IG_APIFY','Импорт Apify',{icon,esc,toast,showDialog,onImport:(text,tool = 'swipe') => {
    activeTool = tool; inputs[tool] = text; delete toolResults[tool];
    route('studio'); analyze();
  }});
  function closeButton() { return `<button class="icon-button" data-action="close-dialog" aria-label="Закрыть окно">${icon('close')}</button>`; }
  function formulas() {
    showDialog(`<div class="dialog-heading"><h2 id="dialog-title">26 формул начала</h2>${closeButton()}</div><p class="dialog-description">Выберите структуру, затем замените пример своей реальной историей.</p><div class="search-box"><span>${icon('search')}</span><label class="hidden" for="formula-search">Поиск формулы</label><input id="formula-search" placeholder="Название или пример…"></div><div class="formula-list" id="formula-list">${formulaCards('')}</div>`);
  }
  function formulaCards(query) { return D.hooks.hooks.filter(h => `${h.name} ${h.example}`.toLowerCase().includes(query.toLowerCase())).map(h => `<div class="formula-card"><h3>${h.id}. ${esc(h.name)}</h3><p>${esc(h.example)}</p><code>${esc(h.template)}</code><button class="button button-secondary button-small" data-formula="${h.id}">Использовать пример${icon('arrow-right')}</button></div>`).join('') || '<p class="muted">Формула не найдена.</p>'; }

  function voice() {
    const p = state.profile;
    return `<div class="page">${pageTitle('Ваш голос — отправная точка','Профиль помогает готовить брифы, в которых узнаётся ваш стиль.',`<button class="button button-secondary" data-action="export-voice">${icon('download')}Скачать voice.md</button>`)}<div class="voice-layout"><section class="panel"><form id="voice-form" class="voice-form"><div class="fields-row"><div><label for="voice-name">Как вас зовут</label><input id="voice-name" name="name" placeholder="Ваше имя" value="${esc(p.name || '')}" maxlength="200"></div><div><label for="voice-handle">Аккаунт</label><input id="voice-handle" name="handle" placeholder="@yourname" value="${esc(p.handle || '')}" maxlength="200"></div></div><div><label for="voice-niche">Что вы делаете</label><input id="voice-niche" name="niche" placeholder="Разбираю трейлеры и теории GTA VI" value="${esc(p.niche || '')}" maxlength="2000"></div><div><label for="voice-audience">К кому обращаетесь</label><input id="voice-audience" name="audience" placeholder="Фанаты GTA, которые ценят детали и проверенные источники" value="${esc(p.audience || '')}" maxlength="2000"></div><div><label for="voice-tone">Как вы звучите</label><select id="voice-tone" name="tone">${['Выберите свой тон','Спокойно и по делу','Живо и с юмором','Тепло и поддерживающе','Прямо и с характером'].map(t => `<option ${p.tone === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div><label for="voice-examples">Тексты, в которых слышно вас</label><textarea id="voice-examples" name="examples" maxlength="20000" placeholder="Вставьте 2–3 своих поста или сценария…">${esc(p.examples || '')}</textarea></div><div><label for="voice-facts">Факты и границы</label><textarea id="voice-facts" name="facts" maxlength="10000" placeholder="Реальные результаты, разрешённые примеры и темы, которых избегаете…">${esc(p.facts || '')}</textarea></div><div><button class="button button-primary" type="submit">${icon('check')}Сохранить профиль</button><p class="field-help" id="profile-save-status">Данные сохраняются в этом браузере. Скачайте профиль для переноса на другое устройство.</p></div></form></section><aside class="profile-help">${icon('voice')}<h2>Меньше общего.<br>Больше вашего.</h2><p>Хороший профиль начинается с конкретики: кому вы помогаете, во что верите и какие слова действительно произносите вслух.</p><ul><li>Добавьте свои реальные тексты.</li><li>Назовите узкую аудиторию.</li><li>Запишите, о чём не говорите.</li><li>Используйте только свои факты.</li></ul><p style="margin-top:18px">Профиль автоматически добавляется в брифы навыков. Внешняя AI-модель к этому образцу не подключена.</p></aside></div></div>`;
  }
  function profileMarkdown() { const p = state.profile; return `# Мой голос\n\nИмя: ${p.name || ''}\nАккаунт: ${p.handle || ''}\nЧто я делаю: ${p.niche || ''}\nАудитория: ${p.audience || ''}\nТон: ${p.tone || ''}\n\n## Мои тексты\n\n${p.examples || ''}\n\n## Факты и границы\n\n${p.facts || ''}\n`; }
  function saveVoice(form) { state.profile = Object.fromEntries(new FormData(form)); persist(); updateChrome(); }
  function saveDraft() {
    const text = $('#tool-text')?.value || '';
    if (!text.trim()) { toast('В пустом черновике пока нечего сохранять.'); return; }
    if (state.drafts.length >= 100) { toast('В студии уже 100 черновиков. Скачайте или удалите ненужные.'); return; }
    inputs[activeTool] = text;
    const parameters = {};
    for (const name of ['wpm','target','keywords']) if ($('#' + name)) parameters[name] = $('#' + name).value;
    state.drafts.unshift({id:id(),tool:activeTool,text,parameters,created:new Date().toISOString()});
    if (persist()) toast('Черновик сохранён');
    updateChrome();
  }
  function id() { return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function drafts() {
    return `<div class="page">${pageTitle('Идеи, к которым хочется вернуться','Ваши черновики хранятся в этом браузере.',`<button class="button button-primary" data-route="studio">${icon('plus')}Новый черновик</button>`)}${state.drafts.length ? `<div class="draft-grid">${state.drafts.map(d => `<article class="draft-card"><div class="draft-card-top"><span class="pill">${esc(TOOL_NAMES[d.tool] || 'Контент')}</span><small>${dateLabel(d.created)}</small></div><h2>${esc(d.text.split('\n')[0].slice(0, 70))}</h2><p>${esc(d.text)}</p><div class="tool-actions"><button class="button button-secondary button-small" data-open-draft="${esc(d.id)}">Открыть${icon('arrow-right')}</button><button class="button button-secondary button-small" data-download-draft="${esc(d.id)}">${icon('download')}Скачать</button><button class="icon-button" data-delete-draft="${esc(d.id)}" aria-label="Удалить черновик">${icon('trash')}</button></div></article>`).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('folder')}</span><h2>У каждой идеи будет своё место</h2><p>Создайте текст в студии и нажмите «В черновики», чтобы вернуться к нему позже.</p><button class="button button-primary" data-route="studio">${icon('plus')}Начать с первой идеи</button></div>`}</div>`;
  }
  function dateLabel(value) { const d = new Date(value); return Number.isNaN(d.valueOf()) ? '' : d.toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'}); }
  const DAYS = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
  function plan() {
    return `<div class="page">${pageTitle('Неделя с хорошим ритмом','Планируйте форматы, меняйте темы и отмечайте готовое.',`<div class="planner-controls"><button class="button button-secondary" data-action="export-plan">${icon('download')}Скачать план</button><button class="button button-primary" data-action="add-plan">${icon('plus')}Добавить идею</button></div>`)}${!state.plan.length ? `<div class="language-note">${icon('info')}<span>План пока пуст. Добавьте свою первую идею или <button class="section-link" data-action="sample-plan">загрузите пример недели</button>.</span></div>` : ''}<div class="planner-grid">${DAYS.map((day, i) => `<section class="planner-day"><div class="planner-day-heading"><span>${day.slice(0, 2).toUpperCase()}</span><button data-plan-day="${i}" aria-label="Добавить идею: ${day}">${icon('plus')}</button></div>${state.plan.filter(p => p.day === i).map(p => `<article class="plan-item ${p.done ? 'completed' : ''}"><span class="plan-format">${esc(p.format)}</span><p>${esc(p.title)}</p><div class="plan-item-actions"><button data-toggle-plan="${esc(p.id)}" aria-label="${p.done ? 'Вернуть в работу' : 'Отметить готовым'}">${icon('check')}</button><button data-edit-plan="${esc(p.id)}" aria-label="Редактировать идею">${icon('text')}</button><button data-delete-plan="${esc(p.id)}" aria-label="Удалить идею">${icon('trash')}</button></div></article>`).join('') || '<div class="day-empty">Место для идеи</div>'}</section>`).join('')}</div><p class="planner-note">Это ваш личный план, без автоматической публикации. Идеи и отметки сохраняются на этом устройстве.</p></div>`;
  }
  function planDialog(day = 0, existingId = null) {
    const p = state.plan.find(x => x.id === existingId) || {day,format:'REELS',title:''};
    showDialog(`<div class="dialog-heading"><h2 id="dialog-title">${existingId ? 'Редактировать идею' : 'Идея для публикации'}</h2>${closeButton()}</div><form id="plan-form" class="dialog-form" data-edit-id="${esc(existingId || '')}"><div class="field"><label for="plan-title">Что хотите рассказать</label><textarea id="plan-title" name="title" required maxlength="1000" placeholder="Одна мысль, история или вопрос…">${esc(p.title)}</textarea></div><div class="fields-row"><div><label for="plan-day">День</label><select id="plan-day" name="day">${DAYS.map((d, i) => `<option value="${i}" ${p.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div><div><label for="plan-format">Формат</label><select id="plan-format" name="format">${['REELS','КАРУСЕЛЬ','STORIES','ПОСТ'].map(f => `<option ${p.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div><button class="button button-primary" type="submit">${icon('check')}Сохранить идею</button></form>`);
  }
  function updateChrome() {
    $('#draft-count').textContent = state.drafts.length;
    $('#top-avatar').textContent = (String(state.profile.name || '').trim()[0] || 'Я').toUpperCase();
  }
  function route(name) {
    if (!PAGES.includes(name)) return;
    currentPage = name;
    try { if (location.hash !== '#'+name) history.pushState({instaStudioPage:name},'', '#'+name); }
    catch { /* Sandboxed previews can prohibit URL changes; rendering still works. */ }
    render();
  }
  function syncLocation() {
    const name = locationPage();
    if (name !== currentPage) { currentPage = name; render(); }
  }
  function render() {
    if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; persist(); }
    const name = currentPage;
    document.body.dataset.view = name;
    const views = {overview,studio,library,voice,drafts,plan,instagram:instagram.render};
    $('#main').innerHTML = views[name]();
    if (name === 'overview') {
      try { validateText(overviewText); requireEnglish(overviewText); $('#overview-analysis').innerHTML = scoreHtml(E.hook(overviewText.trim()),true); }
      catch (e) { $('#overview-analysis').innerHTML = errorHtml(e.message); }
    }
    $('#breadcrumb-title').textContent = {overview:'Обзор',studio:'Студия контента',library:'Библиотека навыков',voice:'Профиль голоса',drafts:'Мои черновики',plan:'Контент-план',instagram:'Instagram'}[name];
    $$('[data-nav]').forEach(a => { a.classList.toggle('active', a.dataset.nav === name); if (a.dataset.nav === name) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
    document.body.classList.remove('nav-open'); $('#menu-toggle').setAttribute('aria-expanded','false');
    if ($('#dialog').open) $('#dialog').close();
    hydrate(); updateChrome(); if (name === 'instagram') instagram.mount(); if (name === 'studio' && activeTool === 'swipe') void apify.mount(); window.scrollTo({top:0,behavior:'instant'});
  }
  document.addEventListener('click', async event => {
    const b = event.target.closest('button, a'); if (!b) return;
    const targetPage = b.dataset.route || (b.tagName === 'A' && b.getAttribute('href')?.match(/^#([a-z]+)$/)?.[1]);
    if (PAGES.includes(targetPage)) {
      if (b.tagName === 'A' && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || b.target === '_blank')) return;
      event.preventDefault(); route(targetPage); return;
    }
    if (b.dataset.skill) { openSkill(b.dataset.skill); return; }
    if (b.dataset.tool) { activeTool = b.dataset.tool; render(); return; }
    if (b.dataset.filter) { libraryFilter = b.dataset.filter; render(); return; }
    if (b.dataset.formula) { const h = D.hooks.hooks.find(x => x.id === Number(b.dataset.formula)); if (h) { inputs.hooks = h.example; activeTool = 'hooks'; $('#dialog').close(); route('studio'); analyze(); } return; }
    if (b.dataset.openDraft) { const d = state.drafts.find(x => x.id === b.dataset.openDraft); if (d) { activeTool = Object.hasOwn(TOOL_NAMES,d.tool) ? d.tool : 'hooks'; inputs[activeTool] = d.text; delete toolResults[activeTool]; route('studio'); Object.entries(d.parameters || {}).forEach(([k, v]) => { const el = document.getElementById(k); if (el && ['wpm','target','keywords'].includes(k)) el.value = v; }); } return; }
    if (b.dataset.downloadDraft) { const d = state.drafts.find(x => x.id === b.dataset.downloadDraft); if (d) download('instagram-draft.txt',d.text); return; }
    if (b.dataset.deleteDraft) { state.drafts = state.drafts.filter(x => x.id !== b.dataset.deleteDraft); persist(); render(); toast('Черновик удалён'); return; }
    if (b.dataset.planDay !== undefined) { planDialog(Number(b.dataset.planDay)); return; }
    if (b.dataset.togglePlan) { const p = state.plan.find(x => x.id === b.dataset.togglePlan); if (p) p.done = !p.done; persist(); render(); return; }
    if (b.dataset.deletePlan) { state.plan = state.plan.filter(x => x.id !== b.dataset.deletePlan); persist(); render(); return; }
    if (b.dataset.editPlan) { const p = state.plan.find(x => x.id === b.dataset.editPlan); if (p) planDialog(p.day,p.id); return; }
    const action = b.dataset.action;
    if (action === 'overview-analyze') { overviewText = $('#overview-hook').value; try { validateText(overviewText); requireEnglish(overviewText); $('#overview-analysis').innerHTML = scoreHtml(E.hook(overviewText.trim()),true); } catch (e) { $('#overview-analysis').innerHTML = errorHtml(e.message); } }
    if (action === 'analyze') analyze();
    if (action === 'load-example') { inputs[activeTool] = DEFAULTS[activeTool]; delete toolResults[activeTool]; render(); analyze(); }
    if (action === 'formulas') formulas();
    if (action === 'save-draft') saveDraft();
    if (action === 'copy-result') copy(toolExports[activeTool] || '');
    if (action === 'download-result') download(activeTool === 'swipe' ? 'instagram-swipe.md' : `instagram-${activeTool}.txt`,toolExports[activeTool] || '');
    if (action === 'upload-tsv') $('#tsv-file').click();
    if (action === 'skill-brief') openSkill(b.dataset.id || 'ig-reel',true);
    if (action === 'close-dialog') $('#dialog').close();
    if (action === 'copy-brief') copy(briefText);
    if (action === 'download-brief') download('instagram-brief.md',briefText);
    if (action === 'export-voice') { if ($('#voice-form')) saveVoice($('#voice-form')); download('voice.md',profileMarkdown()); }
    if (action === 'add-plan') planDialog();
    if (action === 'export-plan') download('instagram-plan.md','# Мой контент-план\n\n' + DAYS.map((d, i) => `## ${d}\n\n` + (state.plan.filter(p => p.day === i).map(p => `- [${p.done ? 'x' : ' '}] ${p.format}: ${p.title}`).join('\n') || 'Свободный день')).join('\n\n'));
    if (action === 'sample-plan') { if (state.plan.length) { toast('Пример доступен для пустого плана. Ваши идеи сохранены.'); return; } state.plan = [{day:0,format:'REELS',title:'Разберите кадр из трейлера'},{day:2,format:'КАРУСЕЛЬ',title:'Теория или факт? Разложите по полочкам'},{day:4,format:'STORIES',title:'Покажите, как монтируете Reels'},{day:6,format:'ПОСТ',title:'Соберите находки недели'}].map(p => ({...p,id:id(),done:false})); persist(); render(); toast('Добавлен пример недели'); }
  });
  document.addEventListener('input', event => {
    const el = event.target;
    if (el.id === 'tool-text') inputs[activeTool] = el.value;
    if (el.id === 'overview-hook') { overviewText = el.value; $('#overview-count').textContent = `${E.wordList(el.value).length} слов`; $('#overview-analysis').innerHTML = '<div class="tool-result-placeholder">' + icon('spark') + 'Текст изменён.<br>Нажмите «Проверить хук», чтобы обновить оценку.</div>'; }
    if (el.id === 'skill-search') { librarySearch = el.value; $('#skill-cards').innerHTML = libraryCards(); }
    if (el.id === 'formula-search') $('#formula-list').innerHTML = formulaCards(el.value);
    if (el.closest('#voice-form')) { state.profile = Object.fromEntries(new FormData(el.closest('#voice-form'))); clearTimeout(profileTimer); profileTimer = setTimeout(() => { persist(); updateChrome(); const status = $('#profile-save-status'); if (status && storageAvailable) status.textContent = 'Изменения сохранены в этом браузере.'; },400); }
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.id === 'voice-form') { event.preventDefault(); clearTimeout(profileTimer); saveVoice(form); if (storageAvailable) toast('Профиль голоса сохранён'); }
    if (form.id === 'brief-form') {
      event.preventDefault(); const data = Object.fromEntries(new FormData(form)); if (!data.context.trim()) return;
      const skill = skillById(form.dataset.skillId), instructions = D.skills.find(s => s.id === skill.id)?.instructions || '';
      briefText = `# Задача: ${skill.title}\n\nРаботай на русском языке. Подготовь результат для Instagram по навыку ${skill.id}.\n\n## Контекст\n${data.context.trim()}\n\n## Аудитория\n${data.audience || state.profile.audience || '{{уточнить аудиторию}}'}\n\n## Цель\n${data.goal || '{{уточнить цель}}'}\n\n${profileMarkdown()}\nНе выдумывай результаты, клиентов и цифры. Если фактов не хватает, отметь это. Ничего не публикуй и не отправляй.\n\n## Инструкции навыка\n\n${instructions}`;
      $('#brief-output').innerHTML = `<div class="dialog-output"><label for="brief-result">Бриф для вашего AI-агента</label><textarea id="brief-result" readonly>${esc(briefText)}</textarea><div class="tool-actions"><button class="button button-primary" data-action="copy-brief">${icon('copy')}Копировать бриф</button><button class="button button-secondary" data-action="download-brief">${icon('download')}Скачать</button></div><p class="field-help">Сайт собирает бриф из ваших данных и исходного навыка. Текст создаст агент, которому вы его передадите.</p></div>`;
    }
    if (form.id === 'plan-form') { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); if (!data.title.trim()) return; const item = state.plan.find(x => x.id === form.dataset.editId); if (item) Object.assign(item,{title:data.title.trim(),day:Number(data.day),format:data.format}); else state.plan.push({id:id(),title:data.title.trim(),day:Number(data.day),format:data.format,done:false}); persist(); $('#dialog').close(); render(); }
  });
  document.addEventListener('change', async event => {
    if (event.target.id !== 'tsv-file') return;
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Выберите файл размером до 2 МБ.'); event.target.value = ''; return; }
    inputs.swipe = await file.text(); $('#tool-text').value = inputs.swipe; analyze();
  });
  $('#menu-toggle').addEventListener('click', () => { const open = document.body.classList.toggle('nav-open'); $('#menu-toggle').setAttribute('aria-expanded',String(open)); });
  $('#nav-shade').addEventListener('click', () => { document.body.classList.remove('nav-open'); $('#menu-toggle').setAttribute('aria-expanded','false'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.body.classList.remove('nav-open'); $('#menu-toggle').setAttribute('aria-expanded','false'); } });
  $('#dialog').addEventListener('click', e => { if (e.target === $('#dialog')) { const r = $('#dialog').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('#dialog').close(); } });
  window.addEventListener('hashchange', syncLocation);
  window.addEventListener('popstate', syncLocation);
  render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
