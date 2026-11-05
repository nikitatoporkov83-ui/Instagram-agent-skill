/* Browser ports of the MIT-licensed Instagram Agent Skill tools by Jake Schincariol.
 * Canonical constants and reference assets are generated directly from the Python tools.
 * Quality and speech heuristics are designed for English, as in the original project.
 */
(() => {
  'use strict';
  const D = globalThis.IG_DATA;
  const clamp = n => Math.max(0, Math.min(100, n));
  const round = (n, digits = 1) => Math.round((n + Number.EPSILON) * 10 ** digits) / 10 ** digits;
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const stdev = a => Math.sqrt(mean(a.map(x => (x - mean(a)) ** 2)));
  const scale = (v, h, m) => h === m ? 50 : clamp((v - m) / (h - m) * 100);
  const all = (text, rx) => [...text.matchAll(new RegExp(rx.source, [...new Set(rx.flags + 'g')].join('')))];
  const matches = (text, rx) => all(text, rx).map(m => m[0]);
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function regex(pattern, flags = '') {
    pattern = pattern.replace(/\(\?([ims]+)\)/g, (_, f) => { flags += f; return ''; });
    pattern = pattern.replace(/\\(["'])/g, '$1');
    pattern = pattern.replace(/\\U([0-9A-Fa-f]{8})/g, (_, h) => `\\u{${parseInt(h, 16).toString(16)}}`);
    return new RegExp(pattern, [...new Set(flags + 'u')].join(''));
  }
  const wordList = text => matches(text.replace(/(?<=\d),(?=\d)/g, ''), /[A-Za-z0-9$%'’\-]+/g);
  const plainWords = text => matches(text, /[A-Za-z']+/g);
  const sentences = text => matches(text, /[^.!?\n]+[.!?]*/g).map(x => x.trim()).filter(x => x.split(/\s+/).length > 2);
  const termPattern = s => new RegExp('\\b' + escape(s).replace(/ /g, '\\s+') + '\\b', 'gi');
  const hasCyrillic = text => /[\u0400-\u052f]/u.test(text);

  function hook(text) {
    const C = D.hookConfig;
    const words = wordList(text), low = words.map(x => x.toLowerCase().replace(/^['’]+|['’]+$/g, ''));
    const number = regex(C.number, 'i');
    const numbers = matches(text, number).map(x => x.trim()).filter(Boolean);
    const propers = [...new Set(matches(text, /(?<!^)\b[A-Z][a-z]{2,}\b/g))];
    const spoken = low.filter(w => C.spoken.includes(w) || C.money.includes(w));
    const hits = numbers.length + propers.length + spoken.length;
    const length = clamp((words.length >= 5 && words.length <= 12 ? 100 : words.length < 5 ? clamp(100 - (5 - words.length) * 20) : clamp(100 - (words.length - 12) * 11)) - (Array.from(text.trim()).length > 60 ? 12 : 0));
    const markers = [...new Set(low.filter(w => C.stakes.includes(w)))];
    if (/\$\s?\d/.test(text)) markers.push('цена');
    const stakes = markers.length === 0 ? 20 : markers.length === 1 ? 70 : 100;
    const weak = C.weak.find(w => low.slice(0, 2).join(' ').startsWith(w) || low[0] === w);
    const payload = low.findIndex((w, i) => C.stakes.includes(w) || C.spoken.includes(w) || C.money.includes(w) || new RegExp('^(?:' + number.source + ')', 'iu').test(words[i]));
    const front = !words.length ? 0 : clamp((payload === -1 ? 30 : payload <= 3 ? 100 : payload <= 6 ? 70 : 40) - (weak ? 30 : 0));
    const address = /\b(you|your|you're|youre|yourself)\b/i.test(text) ? 100 : low.length && C.imperatives.includes(low[0]) ? 90 : /\b(i|my|me|we|our)\b/i.test(text) ? 70 : 35;
    const checks = {
      LENGTH: {score:length, detail:`${words.length} слов · примерно ${round(words.length / 2.75)} сек.`},
      SPECIFICITY: {score:hits === 0 ? 15 : clamp(45 + hits * 30), detail:`Конкретных деталей: ${hits}`},
      STAKES: {score:stakes, detail:markers.length ? `Напряжение: ${markers.slice(0, 4).join(', ')}` : 'Добавьте причину досмотреть'},
      FRONTLOAD: {score:front, detail:payload < 0 ? 'Начните с сути' : `Суть появляется на слове ${payload + 1}`},
      ADDRESS: {score:address, detail:address >= 90 ? 'Обращение к зрителю' : address === 70 ? 'Личная история' : 'Уточните, к кому обращаетесь'},
    };
    const flags = C.dealbreakers.filter(([p]) => regex(p).test(text)).map(([, m]) => m);
    const scores = Object.values(checks).map(x => x.score);
    const raw = clamp(mean(scores) * 0.6 + Math.min(...scores) * 0.4 - flags.length * 15);
    return {hook:text, checks, score:round(raw), verdict:raw >= 70 && Math.min(...scores) >= 55 && !flags.length ? 'STRONG' : raw >= 50 ? 'OK' : 'WEAK', flags, weakest:Object.keys(checks).reduce((a, b) => checks[a].score <= checks[b].score ? a : b)};
  }

  function beats(raw, wpm = 165, target = 30) {
    if (!Number.isFinite(wpm) || wpm <= 0 || wpm > 1000) throw new Error('Укажите темп от 1 до 1000 слов в минуту.');
    if (target !== null && (!Number.isFinite(target) || target <= 0)) throw new Error('Длительность должна быть больше нуля.');
    const wps = wpm / 60, lines = [];
    for (const line of raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean)) {
      if (wordList(line).length / wps <= 6) { lines.push(line); continue; }
      let buffer = '';
      for (const part of matches(line, /[^.!?]+[.!?]*/g).map(x => x.trim()).filter(Boolean)) {
        const candidate = (buffer + ' ' + part).trim();
        if (buffer && wordList(candidate).length / wps > 4) { lines.push(buffer); buffer = part; } else buffer = candidate;
      }
      if (buffer) lines.push(buffer);
    }
    if (!lines.length) throw new Error('Добавьте сценарий: одна строка — один кадр.');
    let clock = 0;
    const rows = lines.map((text, i) => {
      const n = wordList(text).length, duration = n / wps;
      const r = {n:i + 1, start:round(clock, 2), dur:round(duration, 2), words:n, text, concrete:matches(text, /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm).length, label:'', flags:[]};
      clock += duration; return r;
    });
    rows.forEach(r => { if (r.n === 1 || r.start + r.dur <= 3) r.label = 'HOOK'; });
    rows.at(-1).label = rows.at(-1).label === 'HOOK' ? 'HOOK/CTA' : 'CTA';
    rows.forEach(r => { if (!r.label && r.start <= clock / 2 && clock / 2 < r.start + r.dur) r.label = 'MID'; });
    const notes = [];
    if (rows[0].dur > 3) { rows[0].flags.push('Хук длиннее 3 секунд'); notes.push('Сократите первую строку: зритель должен быстро услышать главное.'); }
    if (!rows[0].concrete) notes.push('Добавьте в первую строку число или конкретное имя.');
    rows.forEach(r => { if (r.dur > 4) r.flags.push('Более 4 секунд на один кадр'); });
    const long = rows.filter(r => r.dur > 4);
    if (long.length) notes.push(`Разделите кадры ${long.map(r => r.n).join(', ')} или смените изображение внутри них.`);
    let run = 0;
    rows.forEach(r => { run = r.concrete ? 0 : run + 1; if (run === 3) notes.push(`В кадрах ${r.n - 2}–${r.n} не хватает конкретики.`); });
    const keyWords = text => new Set(wordList(text).map(x => x.toLowerCase()).filter(w => !D.stopwords.includes(w)));
    const first = keyWords(rows[0].text), last = keyWords(rows.at(-1).text);
    const loop = [...first].filter(w => last.has(w));
    notes.push(loop.length ? `Есть петля: начало и конец объединяет «${loop.slice(0, 3).join(', ')}».` : 'Верните в финал слово из начала, чтобы замкнуть ролик.');
    if (target) notes.push(Math.abs(clock - target) <= target * 0.1 ? 'Длительность соответствует цели.' : clock > target ? `Сценарий длиннее цели на ${round(clock - target)} сек.` : `До целевой длительности ${round(target - clock)} сек. Можно оставить короче.`);
    return {wpm, target, total_seconds:round(clock, 2), total_words:rows.reduce((s, r) => s + r.words, 0), beats:rows, notes};
  }

  function caption(text, cut = 125, keywords = []) {
    const t = text.trim(), chars = Array.from(t).length, visible = Array.from(t).slice(0, cut).join('');
    const tags = all(t, /(?:^|\s)(#[A-Za-z0-9_]+)/g).map(x => x[1]);
    const mentions = all(t, /(?:^|\s)(@[A-Za-z0-9_.]+)/g).map(x => x[1]);
    const links = matches(t, /https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|co|io|net|org|ai|app)\/\S*/gi);
    const emoji = matches(t, /[\u{1F300}-\u{1FAFF}☀-➿←-⇿️]/gu).length;
    const asks = D.captionConfig.asks.filter(([p]) => regex(p).test(t)).map(([, n]) => n);
    const filler = tags.filter(tag => D.captionConfig.filler.includes(tag.toLowerCase()));
    const first = t.split('\n')[0] || '', firstLength = Array.from(first.trim()).length;
    const checks = [], add = (check, status, detail) => checks.push({check, status, detail});
    add('LENGTH', chars > 2200 ? 'FAIL' : 'PASS', `${chars} / 2 200 символов`);
    add('FIRST LINE', !first || /^[#@]/.test(first) ? 'FAIL' : firstLength > cut ? 'WARN' : 'PASS', `${firstLength} символов в первой строке`);
    const concrete = matches(visible, /\$\s?\d|\b\d[\d,.]*\b|(?<!^)\b[A-Z][a-z]{2,}\b/gm).length;
    add('HOOK IS CONCRETE', concrete ? 'PASS' : 'WARN', concrete ? `Конкретных деталей до обрезки: ${concrete}` : 'Добавьте конкретику в начало');
    add('HASHTAGS', tags.length > 5 ? 'FAIL' : filler.length ? 'WARN' : 'PASS', `${tags.length} хештегов из 5${filler.length ? ' · есть общие теги' : ''}`);
    const visibleTag = tags.some(tag => new RegExp('(?:^|\\s)' + escape(tag) + '\\b').test(visible));
    add('TAG PLACEMENT', visibleTag ? 'WARN' : 'PASS', visibleTag ? 'Перенесите теги ниже основного текста' : 'Теги не занимают первую строку');
    add('LINKS', links.length ? 'WARN' : 'PASS', links.length ? 'Ссылки в подписи не кликабельны' : 'В тексте нет неактивных ссылок');
    add('ONE ASK', asks.length === 1 ? 'PASS' : 'WARN', asks.length === 1 ? 'Один призыв к действию' : asks.length ? `Призывов к действию: ${asks.length}` : 'Добавьте один призыв к действию');
    add('EMOJI', emoji * 100 / Math.max(chars, 1) > 4 ? 'WARN' : 'PASS', `${emoji} эмодзи`);
    keywords = keywords.map(x => x.trim()).filter(Boolean);
    if (keywords.length) {
      const found = keywords.filter(x => t.toLowerCase().includes(x.toLowerCase()));
      add('SEARCH TERMS', found.length === keywords.length ? 'PASS' : found.length ? 'WARN' : 'FAIL', `${found.length} / ${keywords.length} поисковых фраз найдено`);
    }
    return {characters:chars, limit:2200, truncate_at:cut, visible, truncated:chars > cut, first_line_chars:firstLength, hashtags:tags, mentions, links, emoji, asks, checks, verdict:checks.some(c => c.status === 'FAIL') ? 'FIX' : checks.some(c => c.status === 'WARN') ? 'REVIEW' : 'READY'};
  }

  function structures(text) {
    const flags = [];
    for (const s of D.lexicon.structures) {
      const n = matches(text, regex(s.regex, 'm')).length;
      if (n) flags.push({name:s.name, count:n, fix:s.fix});
    }
    const lens = sentences(text).map(s => s.split(/\s+/).length);
    if (lens.length >= 4 && stdev(lens) / mean(lens) < 0.35) flags.push({name:'Ровная длина предложений', count:lens.length, fix:'Чередуйте короткие и длинные предложения.'});
    return flags;
  }

  function humanize(raw) {
    let text = raw;
    const urls = [];
    text = text.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g, u => { urls.push(u); return `\x00URL${urls.length - 1}\x00`; });
    const report = {invisible:[], typographic:[], lexical:[], structures:[]};
    for (const entry of D.lexicon.invisible) {
      const range = entry.cp.split('-').map(x => parseInt(x.slice(2), 16));
      const p = range.length === 2 ? `[\\u{${range[0].toString(16)}}-\\u{${range[1].toString(16)}}]` : `\\u{${range[0].toString(16)}}`;
      const rx = new RegExp(p, 'gu'), n = matches(text, rx).length;
      if (n) { report.invisible.push({name:entry.cp + ' ' + entry.name, count:n, action:entry.action}); text = text.replace(rx, entry.action === 'delete' ? '' : ' '); }
    }
    const stray = matches(text, /\p{Cf}/gu).length;
    if (stray) { report.invisible.push({name:'Другие невидимые символы', count:stray, action:'delete'}); text = text.replace(/\p{Cf}/gu, ''); }
    for (const entry of D.lexicon.typographic) {
      const n = text.split(entry.from).length - 1;
      if (!n) continue;
      report.typographic.push({name:entry.name, count:n, to:entry.to});
      if (entry.from === '—') text = text.replace(/\s*—\s*/g, ', ');
      else if (entry.from === '–') text = text.replace(/\s*–\s*(?=\d)/g, '-').replace(/\s+–\s+/g, ', ').replace(/–/g, '-');
      else text = text.split(entry.from).join(entry.to);
    }
    text = text.replace(/,\s*([,.;:!?])/g, '$1').replace(/,\s*\n/g, '\n');
    const entries = [...D.lexicon.phrases, ...D.lexicon.words].sort((a, b) => b.find.length - a.find.length);
    for (const e of entries) {
      const rx = termPattern(e.find), n = matches(text, rx).length;
      if (!n) continue;
      report.lexical.push({find:e.find, replace:e.replace || '(удалено)', count:n, family:e.family});
      text = text.replace(rx, s => !e.replace ? '' : s === s.toUpperCase() && s.length > 1 ? e.replace.toUpperCase() : s[0] === s[0].toUpperCase() ? e.replace[0].toUpperCase() + e.replace.slice(1) : e.replace);
    }
    text = text.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]*(?:[,.;:]+[ \t]*)+/gm, '').replace(/^[ \t](?=\S)/gm, '').replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*([,.;:!?])/g, '$1');
    text = text.replace(/\.\.\./g, '\x00ELL\x00').replace(/\.\s*\.+/g, '.').replace(/([!?])\s*\./g, '$1').replace(/\x00ELL\x00/g, '...').replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
    text = text.replace(/,\s*(also|so|still|basically|in the end)\s*,\s*/g, (_, w) => '. ' + w[0].toUpperCase() + w.slice(1) + ', ');
    const starts = all(raw, /(?:^|[.!?]\s+|\n)\s*([A-Za-z])/g).map(x => x[1]);
    if (starts.length && starts.filter(x => x === x.toUpperCase()).length * 2 >= starts.length) text = text.replace(/(?:^|(?<=[.!?] )|(?<=[.!?]\n)|(?<=\n))\s*([a-z])/g, m => m.slice(0, -1) + m.at(-1).toUpperCase());
    urls.forEach((u, i) => { text = text.split(`\x00URL${i}\x00`).join(u); });
    report.structures = structures(text);
    return {text:text.trim() + '\n', report};
  }

  function detect(text) {
    const words = plainWords(text), n = words.length, per = 100 / (n || 1), lens = sentences(text).map(x => x.split(/\s+/).length);
    const variation = lens.length ? stdev(lens) / mean(lens) : 0;
    const concrete = matches(text, /\b\d[\d,.]*%?\b|\$\d/g).length + new Set(matches(text, /(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{2,}\b/gm)).size;
    let hits = 0;
    [...D.lexicon.words, ...D.lexicon.phrases].forEach(e => { hits += matches(text, termPattern(e.find)).length; });
    const invisible = matches(text, /\p{Cf}/gu).length, em = text.split('—').length - 1, curly = matches(text, /[‘’“”]/g).length, ellipsis = text.split('…').length - 1, nbsp = matches(text, /[   ]/g).length;
    const typo = invisible * 4 + em * 2 + curly + ellipsis + nbsp;
    const contractions = matches(text, /\b\w+'(?:s|t|re|ve|ll|d|m)\b/gi).length * per;
    const person = matches(text, /\b(i|me|my|mine|we|us|our|you|your)\b/gi).length * per;
    let tells = 0;
    D.lexicon.structures.forEach(s => { tells += matches(text, regex(s.regex, 'm')).length; });
    const bullets = all(text, /^\s*[-*•]\s+(.+)$/gm).map(x => x[1].trim().split(/\s+/).length);
    const voice = clamp(scale(contractions, 3, 0) * 0.35 + scale(person, 8, 1) * 0.35 + clamp(100 - tells * 22) * 0.3 - (bullets.length >= 3 && stdev(bullets) < 1.6 ? 12 : 0));
    const raw = {
      BURSTINESS:lens.length < 4 ? 50 : scale(variation, 0.7, 0.22),
      SPECIFICITY:n < 25 ? 50 : scale(concrete * per, 6, 0.5),
      'SLOP DENSITY':n ? scale(hits * per, 0, 4) : 50,
      FINGERPRINT:scale(typo * 1000 / Math.max(Array.from(text).length, 1), 0, 12),
      VOICE:n < 25 ? 50 : voice,
    };
    const values = Object.values(raw), overall = mean(values) * 0.6 + Math.min(...values) * 0.4;
    return {checks:Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, {score:round(v)}])), human_score:round(overall), verdict:overall >= 70 && Math.min(...values) >= 55 ? 'PASS' : overall >= 50 ? 'REVIEW' : 'FLAGGED', stock_terms:hits};
  }

  function swipe(raw) {
    const lines = raw.split(/\r?\n/).filter(x => x.trim() && !x.trimStart().startsWith('#'));
    if (!lines.length) throw new Error('Добавьте таблицу TSV или загрузите пример.');
    const header = lines[0].split('\t').map(x => x.trim().toLowerCase());
    const hasHeader = header.includes('views') && header.includes('hook');
    const columns = hasHeader ? header : ['account', 'followers', 'views', 'hook'];
    const rows = [];
    for (const line of lines.slice(hasHeader ? 1 : 0)) {
      const cells = line.split('\t');
      const r = Object.fromEntries(columns.map((k, i) => [k, (cells[i] || '').trim()]));
      for (const k of ['followers', 'median', 'views']) {
        if (/[\d][.,]?\d*\s*[kmbкм]\b/i.test(r[k] || '')) throw new Error('Используйте целые числа: 12000 вместо 12k.');
        const digits = (r[k] || '').replace(/\D/g, ''); r[k] = digits ? Number(digits) : null;
        if (r[k] !== null && !Number.isSafeInteger(r[k])) throw new Error('Числовое значение слишком велико.');
      }
      if (!r.views || !r.hook) continue;
      r.baseline = r.median || r.followers || 0;
      r.outlier = r.baseline ? round(r.views / r.baseline, 2) : null;
      const formula = D.hooks.classify_order.map(id => D.hooks.hooks.find(h => h.id === id)).find(h => regex(h.match, 'i').test(r.hook));
      r.formula_id = formula?.id || null; r.formula = formula?.name || 'unclassified';
      const score = hook(r.hook); r.hook_score = score.score; r.hook_verdict = score.verdict;
      rows.push(r);
    }
    if (!rows.length) throw new Error('Не нашлось строк с просмотрами и текстом хука. Проверьте разделение табуляцией.');
    rows.sort((a, b) => (b.outlier || 0) - (a.outlier || 0));
    return {n:rows.length, accounts:new Set(rows.map(r => r.account || '')).size, baseline:rows.some(r => r.median) ? 'account median' : 'follower count', reels:rows};
  }

  function swipeMarkdown(data) {
    return '# Swipe file\n\n' + data.reels.map(r => `## ${r.outlier ?? '?'}x · ${r.formula} (${r.account || 'без аккаунта'})\n\n- Просмотры: ${r.views}\n- База: ${r.baseline}\n- Оценка хука: ${r.hook_score}\n- Хук: ${r.hook}\n`).join('\n');
  }
  globalThis.IG_ENGINE = {hook, beats, caption, humanize, detect, swipe, swipeMarkdown, hasCyrillic, wordList};
})();
