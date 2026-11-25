/* AAA Game Recreation Bench post. Reads window.POST_DATA (assets/data.js, written by build_data.py) to draw the
   leaderboard, the verdict timeline and the question list of Figure 2, the pass-rate bars and the evidence figure. Switches between
   English and Chinese, and plays each video muted while it is on screen. All prose stays in index.html. */
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Language */
  const LANG_KEY = "ga-post-lang";
  const TITLES = {
    en: "AAA Game Recreation Bench · Are agents ready to recreate AAA-quality games?",
    zh: "AAA Game Recreation Bench · 智能体准备好复刻 3A 品质的游戏了吗？",
  };
  const applyLang = (lang) => {
    root.dataset.lang = lang;
    root.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = TITLES[lang];
  };
  applyLang(root.dataset.lang === "zh" ? "zh" : "en");
  for (const button of $$("[data-lang-toggle]")) {
    button.addEventListener("click", () => {
      const next = root.dataset.lang === "zh" ? "en" : "zh";
      applyLang(next);
      try { localStorage.setItem(LANG_KEY, next); } catch (error) { /* storage can be blocked */ }
    });
  }

  /* Side-by-side videos. On a phone the <source> media picks a file with the original above the recreation; the
     poster follows, and crossing the breakpoint (a phone turned sideways) reloads the right file at the same time. */
  const PHONE = matchMedia("(max-width: 760px)");
  const paired = $$("video[data-stack-poster]");
  for (const video of paired) video.dataset.widePoster = video.getAttribute("poster") || "";
  const fitPosters = () => {
    for (const video of paired) video.poster = PHONE.matches ? video.dataset.stackPoster : video.dataset.widePoster;
  };
  fitPosters();
  PHONE.addEventListener("change", () => {
    fitPosters();
    for (const video of paired) {
      const time = video.currentTime;
      const playing = !video.paused;
      video.load();
      if (time > 0) video.addEventListener("loadedmetadata", () => { video.currentTime = time; }, { once: true });
      if (playing) video.play().catch(() => {});
    }
  });

  const DATA = window.POST_DATA;
  if (!DATA) return;

  /* Text in both languages: the page shows the span of the current one */
  const both = (en, zh) => {
    const fragment = document.createDocumentFragment();
    const english = document.createElement("span");
    english.dataset.l = "en";
    english.textContent = en;
    const chinese = document.createElement("span");
    chinese.dataset.l = "zh";
    chinese.lang = "zh-CN";
    chinese.textContent = zh;
    fragment.append(english, chinese);
    return fragment;
  };
  const VERDICTS = { pass: ["Pass", "通过"], fail: ["Fail", "不通过"], unknown: ["Unknown", "未知"] };
  const SIDES = { Gameplay: ["Gameplay", "玩法"], Visual: ["Visual", "视觉"] };
  const verdictWords = (verdict) => VERDICTS[verdict] || [verdict, verdict];
  const get = (path) => path.split(".").reduce((value, key) => (value == null ? value : value[key]), DATA);
  const percent = (rate) => `${Math.round(rate * 100)}%`;

  /* Pass-rate bars: a bar's existing text is its label */
  for (const bar of $$("[data-rate]")) {
    const rate = get(bar.dataset.rate);
    if (typeof rate !== "number") continue;
    const label = document.createElement("span");
    label.className = "bar__label";
    label.append(...bar.childNodes);
    const track = document.createElement("span");
    track.className = "bar__track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.className = "bar__fill";
    fill.style.width = `${Math.max(0, Math.min(1, rate)) * 100}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar__value";
    value.textContent = percent(rate);
    bar.replaceChildren(label, track, value);
  }

  /* The leaderboard: one row per build under each game, in the order data.js gives them (best first). The names
     and the numbers of a row come from the same record, so they cannot drift apart. */
  const cell = (tag, className, ...content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...content);
    return node;
  };
  for (const group of $$("[data-part=leaderboard] tbody[data-game]")) {
    for (const line of (DATA.leaderboard || {})[group.dataset.game] || []) {
      const model = cell("th", "", line.model);
      model.scope = "row";
      const fill = cell("span", "bar__fill");
      fill.style.width = `${Math.max(0, Math.min(1, line.rate)) * 100}%`;
      const track = cell("span", "bar__track", fill);
      track.setAttribute("aria-hidden", "true");
      /* The setting's own label only shows on a phone, where its column heading is gone */
      const setting = cell("td", "lb__setting", cell("span", "lb__label", both("Tripo + replay: ", "Tripo + 回放：")),
        both(line.tripoReplay ? "Yes" : "No", line.tripoReplay ? "有" : "无"));
      group.append(cell("tr", "", model, cell("td", "lb__harness", line.harness), setting,
        cell("td", "lb__overall", cell("div", "lb__meter", track, cell("span", "bar__value", percent(line.rate)))),
        cell("td", "lb__pct", percent(line.gameplay)), cell("td", "lb__pct", percent(line.visual))));
    }
  }

  /* Videos play while on screen. One the viewer paused, or that a question moved, stays where it is. */
  const scrolledAway = new WeakSet();
  const videos = $$("video[data-autoplay]");
  for (const video of videos) {
    video.addEventListener("pause", () => {
      if (scrolledAway.has(video)) scrolledAway.delete(video);
      else video.dataset.held = "true";
    });
    video.addEventListener("play", () => { delete video.dataset.held; });
  }
  if (!reduced && "IntersectionObserver" in window) {
    const watcher = new IntersectionObserver((entries) => {
      for (const { target: video, isIntersecting } of entries) {
        if (isIntersecting && !video.dataset.held) {
          video.play().catch(() => {});
        } else if (!isIntersecting && !video.paused) {
          scrolledAway.add(video);
          video.pause();
        }
      }
    }, { threshold: 0.35 });
    videos.forEach((video) => watcher.observe(video));
  }

  const seekTo = (video, time) => {
    video.dataset.held = "true";
    video.pause();
    const go = () => { video.currentTime = time; };
    if (video.readyState >= 1) go();
    else {
      video.preload = "auto";
      video.addEventListener("loadedmetadata", go, { once: true });
      video.load();
    }
    const box = video.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) video.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  };

  /* Figure 2 (data-case is on the block that holds the figure and its list): the verdict timeline and the folded
     list of every question */
  for (const figure of $$("[data-case]")) {
    const recording = DATA.cases[figure.dataset.case];
    const video = $("video", figure);
    if (!recording || !video) continue;
    const timed = recording.checks.filter((check) => check.at !== null).sort((a, b) => a.at - b.at);
    const whole = recording.checks.filter((check) => check.at === null);
    const marks = [];
    const rows = [];

    const readout = $("[data-part=readout]", figure);
    const show = (check) => {
      if (!readout) return;
      const time = document.createElement("span");
      time.className = "rt";
      time.textContent = `${check.at.toFixed(1)} s`;
      const title = document.createElement("b");
      title.lang = "en";
      title.textContent = check.title;
      const side = document.createElement("span");
      side.append(" · ", both(...(SIDES[check.side] || [check.side, check.side])), " · ");
      const verdict = document.createElement("span");
      verdict.className = "v";
      verdict.dataset.v = check.verdict;
      verdict.append(both(...verdictWords(check.verdict)));
      const why = document.createElement("span");
      why.className = "why";
      why.lang = "en";
      why.textContent = check.reason;
      readout.replaceChildren(time, " ", title, side, verdict, why);
      for (const mark of marks) mark.button.setAttribute("aria-pressed", String(mark.check === check));
    };

    const timeline = $("[data-part=timeline]", figure);
    if (timeline && recording.duration) {
      const lanesEn = (timeline.dataset.laneEn || "Gameplay|Visual").split("|");
      const lanesZh = (timeline.dataset.laneZh || "玩法|视觉").split("|");
      const names = document.createElement("div");
      names.className = "tl__names";
      const body = document.createElement("div");
      body.className = "tl__body";
      const lanes = [];
      ["Gameplay", "Visual"].forEach((side, index) => {
        const name = document.createElement("span");
        name.append(both(lanesEn[index], lanesZh[index]));
        names.append(name);
        const track = document.createElement("div");
        track.className = "tl__track";
        const items = [];
        lanes.push({ track, items });
        for (const check of timed.filter((item) => item.side === side)) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "tl__mark";
          button.dataset.v = check.verdict;
          button.style.left = `${(check.at / recording.duration) * 100}%`;
          button.setAttribute("aria-pressed", "false");
          button.setAttribute("aria-label", `${check.at.toFixed(1)} s, ${check.title}, ${side}, ${verdictWords(check.verdict)[0]}`);
          button.title = `${check.at.toFixed(1)} s · ${check.title}`;
          button.addEventListener("click", () => { show(check); seekTo(video, check.at); });
          track.append(button);
          marks.push({ button, check });
          items.push({ button, check });
        }
        body.append(track);
      });
      /* Markers less than MIN_GAP pixels apart form a group, and a group's markers alternate above and below the
         centre line. Pixels depend on the track's width, so this runs again whenever the timeline is resized. */
      const MIN_GAP = 16;
      const spread = () => {
        for (const { track, items } of lanes) {
          const width = track.clientWidth;
          if (!width) continue;
          const xs = items.map(({ check }) => (check.at / recording.duration) * width);
          let start = 0;
          for (let end = 1; end <= items.length; end += 1) {
            if (end < items.length && xs[end] - xs[end - 1] < MIN_GAP) continue;
            for (let k = start; k < end; k += 1) {
              const lane = end - start === 1 ? 0 : (k - start) % 2 === 0 ? -1 : 1;
              items[k].button.style.setProperty("--lane", String(lane));
            }
            start = end;
          }
        }
      };
      const axis = document.createElement("div");
      axis.className = "tl__axis";
      axis.setAttribute("aria-hidden", "true");
      const step = recording.duration > 20 ? 5 : 2;
      for (let second = 0; second <= recording.duration; second += step) {
        const tick = document.createElement("span");
        tick.style.left = `${(second / recording.duration) * 100}%`;
        tick.textContent = second === 0 ? "0 s" : String(second);
        axis.append(tick);
      }
      const head = document.createElement("div");
      head.className = "tl__head";
      body.append(axis, head);
      timeline.append(names, body);
      spread();
      if ("ResizeObserver" in window) new ResizeObserver(spread).observe(body);
      const follow = () => { head.style.left = `${Math.min(1, video.currentTime / recording.duration) * 100}%`; };
      video.addEventListener("timeupdate", follow);
      video.addEventListener("seeked", follow);
      follow();
    }

    const list = $("[data-part=questions]", figure);
    const template = $("#tpl-question");
    if (list && template) {
      const add = (check) => {
        const item = template.content.firstElementChild.cloneNode(true);
        const button = $(".qs__row", item);
        const why = $(".qs__why", item);
        why.id = `${figure.dataset.case}-why-${rows.length}`;
        button.setAttribute("aria-controls", why.id);
        $(".qs__time", item).textContent = check.at === null ? "" : `${check.at.toFixed(1)} s`;
        $(".qs__title", item).textContent = check.title;
        $(".qs__type", item).append(both(...(SIDES[check.side] || [check.side, check.side])));
        const verdict = $(".v", item);
        verdict.dataset.v = check.verdict;
        verdict.append(both(...verdictWords(check.verdict)));
        $(".qs__judge", item).append(both("Judge.", "裁判理由："));
        $("span[lang=en]", why).textContent = check.reason;
        button.addEventListener("click", () => {
          const opening = button.getAttribute("aria-expanded") !== "true";
          button.setAttribute("aria-expanded", String(opening));
          why.hidden = !opening;
          if (opening && check.at !== null) seekTo(video, check.at);
        });
        list.append(item);
        rows.push({ item, at: check.at });
      };
      timed.forEach(add);
      if (whole.length) {
        const heading = document.createElement("li");
        heading.className = "qs__group";
        heading.append(both(list.dataset.wholeEn || "Whole recording", list.dataset.wholeZh || "整段录像"));
        list.append(heading);
        whole.forEach(add);
      }
      const mark = () => {
        const now = video.currentTime + 0.05;
        let current = null;
        for (const row of rows) if (row.at !== null && row.at <= now) current = row;
        for (const row of rows) row.item.classList.toggle("is-now", row === current);
      };
      video.addEventListener("timeupdate", mark);
      video.addEventListener("seeked", mark);
    }
  }

  /* Figure 4: one visual question as the judge saw it */
  for (const figure of $$("[data-pair]")) {
    const pair = (DATA.pairs || []).find((item) => item.key === figure.dataset.pair);
    if (!pair) continue;
    const moment = pair.moments[0];
    const candidate = moment.candidates.find((frame) => frame.src === pair.based) || moment.candidates.at(-1);
    const folder = "media/pairs/";
    $("[data-part=reference]", figure).src = folder + moment.reference;
    $("[data-part=reference-label]", figure).replaceChildren(both(`Original · ${moment.time.toFixed(2)} s`, `原版 · ${moment.time.toFixed(2)} 秒`));
    if (pair.wiki.length) $("[data-part=wiki]", figure).src = folder + pair.wiki[0];
    $("[data-part=candidate]", figure).src = folder + candidate.src;
    $("[data-part=candidate-label]", figure).replaceChildren(both(`Recreation · ${candidate.time.toFixed(2)} s`, `复刻版 · ${candidate.time.toFixed(2)} 秒`));
    const verdict = $("[data-part=verdict]", figure);
    verdict.dataset.v = pair.verdict;
    verdict.replaceChildren(both(...verdictWords(pair.verdict)));
    $("[data-part=reason]", figure).textContent = pair.reason;
  }
})();
