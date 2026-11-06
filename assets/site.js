(() => {
  const DATA = window.SITE_DATA;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phoneLayout = () => matchMedia("(max-width: 820px)").matches;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const $ = (selector, root = document) => root.querySelector(selector);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  };
  const icon = (name, className = "") => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", `ico ${className}`.trim());
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  };
  const clock = (t) => {
    const whole = Math.max(0, t);
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${(whole - minutes * 60).toFixed(1).padStart(4, "0")}`;
  };
  const setPressed = (buttons, active) => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button === active));
  };
  const sf6Clip = (id) => DATA.sf6.find((clip) => clip.id === id);
  const celesteClip = (id) => DATA.celeste.find((clip) => clip.id === id);

  /* Language: English lives in index.html and in the strings below, and zh.js maps them to Chinese. */
  const ZH = window.SITE_ZH;
  const LANG_KEY = "game-anything-lang";
  const ZH_FONT = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@500;700;900&display=swap";
  let lang = "en";
  try {
    if (localStorage.getItem(LANG_KEY) === "zh") lang = "zh";
  } catch { /* Private windows can refuse storage. */ }
  const tr = (en, key = en) => (lang === "zh" && ZH[key]) || en;
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, name) => values[name]);
  const bindings = [];
  const onLanguage = [];
  const paint = ([node, attribute, en, key]) => {
    if (attribute) node.setAttribute(attribute, tr(en, key));
    else node.innerHTML = tr(en, key);
  };
  const bind = (node, attribute, en, key = en) => {
    const binding = [node, attribute, en, key];
    bindings.push(binding);
    paint(binding);
    return node;
  };
  for (const node of document.querySelectorAll("[data-t]")) bind(node, null, node.innerHTML, node.dataset.t);
  for (const node of document.querySelectorAll("[data-t-aria]")) bind(node, "aria-label", node.getAttribute("aria-label"), node.dataset.tAria);
  for (const node of document.querySelectorAll("[data-t-alt]")) bind(node, "alt", node.alt, node.dataset.tAlt);
  const langButton = $("#lang-toggle");
  const showLanguage = () => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    if (lang === "zh" && !$("#zh-font")) document.head.append(el("link", { id: "zh-font", rel: "stylesheet", href: ZH_FONT }));
    langButton.textContent = lang === "zh" ? "EN" : "中文";
    langButton.lang = lang === "zh" ? "en" : "zh-CN";
    langButton.setAttribute("aria-label", lang === "zh" ? "Switch to English" : "切换到中文");
  };
  showLanguage();
  langButton.addEventListener("click", () => {
    lang = lang === "zh" ? "en" : "zh";
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch { /* The choice then lasts only for this page. */ }
    showLanguage();
    bindings.forEach(paint);
    onLanguage.forEach((update) => update());
  });

  /* Copy link */
  const shareUrl = window.SITE_SHARE_URL || location.href.split("#")[0];
  for (const button of document.querySelectorAll("[data-copy-link]")) {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        button.textContent = tr("Copied");
        setTimeout(() => { button.textContent = tr("Copy link"); }, 1800);
      } catch {
        let field = button.parentElement.querySelector(".copy-field");
        if (!field) {
          field = el("input", { class: "copy-field", readonly: "", value: shareUrl, "aria-label": tr("Link to this page") });
          button.after(field);
        }
        field.focus();
        field.select();
        button.textContent = tr("Select the link");
      }
    });
  }

  /* Turn the recorded key presses into the notation a player would read: 8-way directions and buttons. */
  const DIRECTION_ROTATION = {
    "0,-1": 0, "1,-1": 45, "1,0": 90, "1,1": 135, "0,1": 180, "-1,1": 225, "-1,0": 270, "-1,-1": 315,
  };
  const DIRECTION_VECTOR = { "←": [-1, 0], "→": [1, 0], "↓": [0, 1], "↑": [0, -1] };
  function inputTokens(lanes) {
    const events = [];
    for (const lane of lanes) {
      if (lane.tone === "dir") {
        const vector = DIRECTION_VECTOR[lane.role || lane.cap];
        for (const [a, b] of lane.bars) {
          events.push({ t: a, order: 1, vector, delta: 1 });
          events.push({ t: b, order: 0, vector, delta: -1 });
        }
      } else {
        const label = lane.tone === "m" ? lane.cap : (lane.role || lane.cap).toUpperCase();
        for (const [a] of lane.bars) events.push({ t: a, order: 2, label });
      }
    }
    events.sort((x, y) => x.t - y.t || x.order - y.order);
    const tokens = [];
    let x = 0;
    let y = 0;
    let lastDirection = null;
    for (const event of events) {
      if (event.label) {
        tokens.push({ t: event.t, label: event.label });
        continue;
      }
      x += event.vector[0] * event.delta;
      y += event.vector[1] * event.delta;
      const key = `${Math.sign(x)},${Math.sign(y)}`;
      if (key === "0,0") {
        lastDirection = null;
      } else if (key !== lastDirection) {
        tokens.push({ t: event.t, rotation: DIRECTION_ROTATION[key] });
        lastDirection = key;
      }
    }
    return tokens;
  }

  /* The select screen: one source video drawn onto two equal screens, so they can never drift apart. */
  const GAMES = {
    celeste: {
      input: "VIDEO",
      clip: () => celesteClip("ckpt0-wavedash"),
      stills: ["media/figures/hero-celeste-original.webp", "media/figures/hero-celeste-recreation.webp"],
      alt: ["The original Celeste, Madeline at the start of Chapter 1", "The recreation of the same screen at the same input time"],
    },
    sf6: {
      input: "VIDEO",
      clip: () => sf6Clip("04"),
      stills: ["media/figures/hero-sf6-original.webp", "media/figures/hero-sf6-recreation.webp"],
      alt: ["The original Street Fighter 6, Ryu throwing a Hadoken at Ken", "The recreation at the same input time, throwing the same Hadoken"],
    },
    sekiro: {
      input: "VIDEO", deck: "REBUILT FROM VIDEO",
      stills: ["media/figures/sekiro-fire-original.webp", "media/figures/sekiro-fire-recreation.webp"],
      alt: ["The original Sekiro: a band of flame sweeping across the rooftop", "The recreation: a band of flame sweeping across the rooftop"],
    },
    pvz: {
      input: "VIDEO", deck: "REBUILT FROM VIDEO",
      stills: ["media/figures/pvz-wave-original.webp", "media/figures/pvz-wave-recreation.webp"],
      alt: ["The original Plants vs. Zombies: the full pool board with the huge wave warning", "The recreation: the full pool board with the huge wave warning"],
    },
    repo: {
      input: "REPO", deck: "720-BYTE BRIEF, 46 MINUTES",
      stills: [null, "media/figures/repo-rebuild.webp"],
      alt: [null, "The shooter a coding agent rebuilt, during a match"],
    },
  };

  class VersusStage {
    constructor() {
      this.stage = $("#top");
      this.screens = [$("#screen-a"), $("#screen-b")];
      this.stills = this.screens.map((screen) => $(".screen__still", screen));
      this.canvases = this.screens.map((screen) => $("canvas", screen));
      this.contexts = this.canvases.map((canvas) => canvas.getContext("2d"));
      this.tokensBox = $("#hero-tokens");
      this.strip = $(".tokens__strip", this.tokensBox);
      this.playButton = $("#hero-play");
      this.seekInput = $("#hero-seek");
      this.deckLabel = $("#deck-label");
      this.tagInput = $("#tag-input");
      this.repoCard = $("#screen-repo");
      this.pipeVideo = $("#pipe-video");
      this.pipeRepo = $("#pipe-repo");
      this.video = el("video", { muted: "", playsinline: "", loop: "", preload: "auto", class: "stage__source", "aria-hidden": "true", tabindex: "-1" });
      this.video.muted = true;
      this.stage.append(this.video);
      this.visible = true;
      this.wantsPlay = !reducedMotion;
      this.tokens = [];
      this.current = -1;

      this.playButton.addEventListener("click", () => (this.video.paused ? this.play() : this.pause()));
      this.video.addEventListener("play", () => { this.showState(); this.loop(); });
      this.video.addEventListener("pause", () => this.showState());
      this.video.addEventListener("loadeddata", () => {
        this.draw();
        if (this.wantsPlay && this.visible) this.video.play().catch(() => this.showState());
      });
      this.video.addEventListener("seeked", () => { this.draw(); this.sync(); });
      this.video.addEventListener("timeupdate", () => this.sync());
      this.seekInput.addEventListener("input", () => {
        this.video.currentTime = Number(this.seekInput.value);
        this.sync();
      });
      new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (!this.clip) return;
        if (this.visible && this.wantsPlay) this.video.play().catch(() => {});
        else if (!this.visible && !this.video.paused) this.video.pause();
      }, { threshold: 0.15 }).observe(this.stage);
      addEventListener("resize", () => this.measureTokens());
      onLanguage.push(() => this.label());
    }

    label() {
      const game = GAMES[this.game];
      this.deckLabel.textContent = tr(this.clip ? "SAME KEYS" : game.deck);
      this.stills.forEach((still, index) => {
        if (game.stills[index]) still.alt = tr(game.alt[index]);
      });
      this.showState();
    }

    select(id, { slam = true } = {}) {
      const game = GAMES[id];
      this.game = id;
      this.clip = game.clip ? game.clip() : null;
      this.tagInput.textContent = game.input;
      this.repoCard.hidden = game.input !== "REPO";
      this.pipeVideo.hidden = game.input === "REPO";
      this.pipeRepo.hidden = game.input !== "REPO";
      this.stills.forEach((still, index) => {
        still.hidden = !game.stills[index];
        if (game.stills[index]) still.src = game.stills[index];
      });
      this.contexts.forEach((context, index) => context.clearRect(0, 0, this.canvases[index].width, this.canvases[index].height));
      const live = Boolean(this.clip);
      for (const node of [...this.canvases, this.playButton, this.seekInput, this.tokensBox]) node.hidden = !live;
      if (live) {
        this.seekInput.max = String(this.clip.duration);
        this.renderTokens(this.clip);
        this.video.src = this.clip.src;
        this.video.load();
        this.sync();
      } else {
        this.video.pause();
        this.video.removeAttribute("src");
        this.video.load();
      }
      this.label();
      if (slam && !reducedMotion) {
        this.stage.classList.remove("is-slam");
        void this.stage.offsetWidth;
        this.stage.classList.add("is-slam");
      }
    }

    renderTokens(clip) {
      this.tokens = inputTokens(clip.lanes);
      this.current = -1;
      const nodes = [];
      let previous = -Infinity;
      for (const token of this.tokens) {
        if (token.t - previous > 0.35 && nodes.length) nodes.push(el("span", { class: "tok--gap" }));
        previous = token.t;
        const node = el("span", { class: "tok" });
        if (token.label) node.textContent = token.label;
        else {
          const arrow = icon("arrow");
          arrow.style.rotate = `${token.rotation}deg`;
          node.append(arrow);
        }
        token.node = node;
        nodes.push(node);
      }
      this.strip.replaceChildren(...nodes);
      this.strip.style.transform = "translateX(0)";
      this.measureTokens();
    }

    measureTokens() {
      for (const token of this.tokens) token.left = token.node.offsetLeft;
      this.current = -1;
    }

    draw() {
      const { video } = this;
      if (!this.clip || video.readyState < 2 || !video.videoWidth) return;
      const width = video.videoWidth / 2;
      const height = video.videoHeight;
      this.canvases.forEach((canvas, index) => {
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        this.contexts[index].drawImage(video, index * width, 0, width, height, 0, 0, width, height);
      });
    }

    sync() {
      if (!this.clip) return;
      const t = Math.min(this.video.currentTime || 0, this.clip.duration);
      this.seekInput.value = String(t);
      this.seekInput.style.setProperty("--pct", `${(t / this.clip.duration) * 100}%`);
      let index = -1;
      for (let low = 0, high = this.tokens.length - 1; low <= high;) {
        const middle = (low + high) >> 1;
        if (this.tokens[middle].t <= t) { index = middle; low = middle + 1; } else high = middle - 1;
      }
      if (index !== this.current) {
        this.tokens[this.current]?.node.classList.remove("tok--on");
        const token = this.tokens[index];
        token?.node.classList.add("tok--on");
        const room = this.tokensBox.clientWidth;
        const left = token ? token.left : 0;
        const maximum = Math.max(0, this.strip.scrollWidth - room);
        this.strip.style.transform = `translateX(${-Math.min(maximum, Math.max(0, left - room * 0.3))}px)`;
        this.current = index;
      }
    }

    loop() {
      if (this.looping) return;
      this.looping = true;
      const tick = () => {
        this.draw();
        this.sync();
        if (this.video.paused || this.video.ended) {
          this.looping = false;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    showState() {
      const paused = this.video.paused;
      this.playButton.replaceChildren(icon(paused ? "play" : "pause"));
      this.playButton.setAttribute("aria-label", tr(paused ? "Play" : "Pause"));
    }

    play() {
      this.wantsPlay = true;
      this.video.play().catch(() => { this.wantsPlay = false; this.showState(); });
    }

    pause() {
      this.wantsPlay = false;
      this.video.pause();
      this.showState();
    }
  }

  const stage = new VersusStage();
  const tiles = [...document.querySelectorAll(".tile[data-game]")];
  tiles.forEach((tile, index) => {
    tile.tabIndex = tile.getAttribute("aria-pressed") === "true" ? 0 : -1;
    tile.addEventListener("click", () => {
      setPressed(tiles, tile);
      tiles.forEach((other) => { other.tabIndex = other === tile ? 0 : -1; });
      stage.select(tile.dataset.game);
      /* On a phone the tiles sit below the stage: bring the slam back into view. */
      if (phoneLayout() && stage.stage.getBoundingClientRect().top < 0) stage.stage.scrollIntoView({ block: "start" });
    });
    tile.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = tiles[(index + step + tiles.length) % tiles.length];
      tile.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    });
  });
  stage.select("celeste", { slam: false });

  /* The wordmark joins the nav once the title has scrolled away. */
  new IntersectionObserver(([entry]) => $(".nav .brand").classList.toggle("is-named", !entry.isIntersecting),
    { rootMargin: "-56px 0px 0px 0px" }).observe($(".intro h1"));

  /* Compare player for the game sheets */
  class ComparePlayer {
    constructor(root) {
      this.root = root;
      this.wantsPlay = false;
      this.visible = false;
      this.view = "split";
      this.wipe = 0.5;
      this.clip = null;
      this.pendingSeek = null;
      this.build();
      new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible && this.wantsPlay) this.video.play().catch(() => {});
        else if (!this.visible && !this.video.paused) this.video.pause();
      }, { threshold: 0.2 }).observe(this.node);
      new ResizeObserver(() => this.layout()).observe(this.node);
      onLanguage.push(() => {
        this.layout();
        this.showPaused(this.video.paused);
      });
    }

    build() {
      this.video = el("video", { muted: "", playsinline: "", loop: "", preload: "metadata" });
      this.video.muted = true;
      this.canvas = el("canvas", { hidden: "" });
      this.ctx = this.canvas.getContext("2d");
      this.wipeHandle = bind(el("button", {
        class: "wipe", type: "button", role: "slider", hidden: "",
        "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50",
      }, icon("chevrons")), "aria-label", "Wipe position");
      this.bigPlay = bind(el("button", { class: "player__big", type: "button" }, icon("play")), "aria-label", "Play");
      this.message = bind(el("div", { class: "player__msg", hidden: "" }), null, "This clip could not be loaded. Check your connection and reload the page.");
      this.screen = el("div", { class: "player__screen" },
        this.video, this.canvas, this.wipeHandle,
        bind(el("span", { class: "player__tag player__tag--a" }), null, "1P ORIGINAL"),
        bind(el("span", { class: "player__tag player__tag--b" }), null, "2P RECREATION"),
        this.bigPlay, this.message);
      this.playButton = el("button", { class: "icon-btn icon-btn--play", type: "button" }, icon("play"));
      this.time = el("div", { class: "player__time", role: "timer" });
      const splitButton = el("button", { type: "button", "aria-pressed": "true", onclick: (event) => {
        this.view = "split";
        setPressed(views, event.currentTarget);
        this.layout();
      } });
      const wipeButton = bind(el("button", { type: "button", "aria-pressed": "false", onclick: (event) => {
        this.view = "wipe";
        setPressed(views, event.currentTarget);
        this.layout();
      } }), null, "Wipe");
      const views = [splitButton, wipeButton];
      this.splitButton = splitButton;
      this.seekInput = bind(el("input", { class: "seek", type: "range", min: "0", max: "1", step: "0.05", value: "0",
        oninput: () => this.seek(Number(this.seekInput.value)) }), "aria-label", "Seek through the recording");
      this.bar = el("div", { class: "player__bar" },
        this.playButton,
        this.time,
        el("div", { class: "player__spacer" }),
        bind(el("div", { class: "seg", role: "group" }, ...views), "aria-label", "View"));
      this.node = el("div", { class: "player", "data-view": "split" },
        el("div", { class: "player__labels" }, bind(el("span"), null, "1P ORIGINAL"), bind(el("span"), null, "2P RECREATION")),
        this.screen, this.seekInput, this.bar);
      this.root.append(this.node);

      const toggle = () => (this.video.paused ? this.play() : this.pause());
      this.playButton.addEventListener("click", toggle);
      this.bigPlay.addEventListener("click", (event) => { event.stopPropagation(); this.play(); });
      this.video.addEventListener("click", toggle);
      this.video.addEventListener("play", () => { this.showPaused(false); this.loop(); });
      this.video.addEventListener("pause", () => this.showPaused(true));
      this.video.addEventListener("seeked", () => this.sync());
      this.video.addEventListener("timeupdate", () => this.sync());
      this.video.addEventListener("loadeddata", () => {
        this.message.hidden = true;
        if (this.pendingSeek !== null) {
          this.video.currentTime = this.pendingSeek;
          this.pendingSeek = null;
        }
        this.sync();
        if (this.wantsPlay && this.visible) this.video.play().catch(() => {});
      });
      this.video.addEventListener("error", () => { if (this.video.getAttribute("src")) this.message.hidden = false; });
      this.bindWipe();
    }

    bindWipe() {
      const setWipe = (value) => {
        this.wipe = Math.min(1, Math.max(0, value));
        this.wipeHandle.style.left = `${this.wipe * 100}%`;
        this.wipeHandle.setAttribute("aria-valuenow", String(Math.round(this.wipe * 100)));
        this.draw();
      };
      this.setWipe = setWipe;
      const move = (event) => {
        const box = this.screen.getBoundingClientRect();
        setWipe((event.clientX - box.left) / box.width);
      };
      this.screen.addEventListener("pointerdown", (event) => {
        if (this.mode !== "wipe" || this.bigPlay.contains(event.target)) return;
        this.screen.setPointerCapture(event.pointerId);
        move(event);
      });
      this.screen.addEventListener("pointermove", (event) => {
        if (this.screen.hasPointerCapture(event.pointerId)) move(event);
      });
      this.screen.addEventListener("pointerup", (event) => {
        if (this.screen.hasPointerCapture(event.pointerId)) this.screen.releasePointerCapture(event.pointerId);
      });
      this.wipeHandle.addEventListener("keydown", (event) => {
        const delta = { ArrowLeft: -0.05, ArrowRight: 0.05 }[event.key];
        if (delta) {
          event.preventDefault();
          setWipe(this.wipe + delta);
        }
      });
    }

    duration() {
      return this.clip ? this.clip.duration : 0;
    }

    load(clip, { play = false, at = null } = {}) {
      this.clip = clip;
      this.wantsPlay = play;
      this.pendingSeek = at;
      this.message.hidden = true;
      this.video.poster = clip.poster;
      this.video.src = clip.src;
      this.video.load();
      this.seekInput.max = String(clip.duration);
      this.showPaused(true);
      this.layout();
      this.sync();
    }

    layout() {
      const narrow = this.node.clientWidth < 640;
      this.splitButton.textContent = tr(narrow ? "Stacked" : "Side by side");
      const mode = this.view === "wipe" ? "wipe" : narrow ? "stack" : "split";
      this.mode = mode;
      this.node.dataset.view = mode;
      this.canvas.hidden = mode === "split";
      this.wipeHandle.hidden = mode !== "wipe";
      if (mode !== "split" && this.video.preload !== "auto") this.video.preload = "auto";
      this.setWipe(this.wipe);
      this.draw();
    }

    draw() {
      const { video, ctx, canvas, mode } = this;
      if (mode === "split" || video.readyState < 2 || !video.videoWidth) return;
      const W = video.videoWidth / 2;
      const H = video.videoHeight;
      if (mode === "wipe") {
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        const x = Math.round(W * this.wipe);
        if (x > 0) ctx.drawImage(video, 0, 0, x, H, 0, 0, x, H);
        if (x < W) ctx.drawImage(video, W + x, 0, W - x, H, x, 0, W - x, H);
      } else {
        if (canvas.width !== W || canvas.height !== H * 2) { canvas.width = W; canvas.height = H * 2; }
        ctx.drawImage(video, 0, 0, W, H, 0, 0, W, H);
        ctx.drawImage(video, W, 0, W, H, 0, H, W, H);
      }
    }

    sync() {
      if (!this.clip) return;
      const t = Math.min(this.video.currentTime || 0, this.duration());
      this.time.replaceChildren(el("b", { text: clock(t) }), ` / ${clock(this.duration())}`);
      this.seekInput.value = String(t);
      this.seekInput.style.setProperty("--pct", `${(t / this.duration()) * 100}%`);
      this.draw();
      this.onSync?.();
    }

    loop() {
      if (this.looping) return;
      this.looping = true;
      const tick = () => {
        this.sync();
        if (this.video.paused || this.video.ended) {
          this.looping = false;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    showPaused(paused) {
      this.playButton.replaceChildren(icon(paused ? "play" : "pause"));
      this.playButton.setAttribute("aria-label", tr(paused ? "Play" : "Pause"));
      this.bigPlay.hidden = !paused || this.wantsPlay;
    }

    play() {
      this.wantsPlay = true;
      this.bigPlay.hidden = true;
      this.video.play().catch(() => { this.wantsPlay = false; this.showPaused(true); });
    }

    pause() {
      this.wantsPlay = false;
      this.video.pause();
      this.showPaused(true);
    }

    seek(t) {
      if (this.video.readyState >= 1) this.video.currentTime = Math.min(Math.max(0, t), this.duration() - 0.01);
      else this.pendingSeek = t;
      this.sync();
    }
  }

  /* Live clips in the matrix: one video on two canvases, like the stage, so the halves stay in step. */
  const startReel = (root, clips) => {
    const contexts = [...root.querySelectorAll("canvas")].map((canvas) => canvas.getContext("2d"));
    const button = $(".cell__play", root);
    const video = el("video", { muted: "", playsinline: "", preload: "none", class: "cell__source", "aria-hidden": "true", tabindex: "-1" });
    video.muted = true;
    root.append(video);
    let index = 0;
    let wanted = !reducedMotion;
    let looping = false;
    const draw = () => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const width = video.videoWidth / 2;
      const height = video.videoHeight;
      contexts.forEach((context, side) => {
        const { canvas } = context;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        context.drawImage(video, side * width, 0, width, height, 0, 0, width, height);
      });
    };
    const loop = () => {
      draw();
      if (video.paused || video.ended) {
        looping = false;
        return;
      }
      requestAnimationFrame(loop);
    };
    const showState = () => {
      button.replaceChildren(icon(video.paused ? "play" : "pause"));
      button.setAttribute("aria-label", tr(video.paused ? "Play" : "Pause"));
    };
    onLanguage.push(showState);
    const play = () => {
      if (!video.getAttribute("src")) video.src = clips[index].src;
      video.play().catch(() => {});
    };
    video.addEventListener("play", () => {
      showState();
      if (!looping) {
        looping = true;
        requestAnimationFrame(loop);
      }
    });
    video.addEventListener("pause", showState);
    video.addEventListener("loadeddata", draw);
    video.addEventListener("ended", () => {
      index = (index + 1) % clips.length;
      video.src = clips[index].src;
      play();
    });
    button.addEventListener("click", () => {
      wanted = video.paused;
      if (wanted) play();
      else video.pause();
    });
    showState();
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && wanted) play();
      else video.pause();
    }, { threshold: 0.3 }).observe(root);
  };
  startReel($("#sf6"), [sf6Clip("04"), sf6Clip("01")]);
  startReel($("#elden"), [{ src: "media/elden/demo.mp4" }]);
  startReel($("#gta"), [{ src: "media/gta/highlights.mp4" }]);

  const outcomes = (clip) => clip.verdicts.filter((verdict) => verdict.focus === "Outcome");
  const passes = (verdicts) => verdicts.filter((verdict) => verdict.v === "pass").length;
  const renderEval = () => {
    $("#celeste-eval").textContent = fill(tr("{checks} judge checks across {recordings} same-key recordings."), DATA.counts);
  };
  renderEval();
  onLanguage.push(renderEval);

  /* Judge reasons name times in free text; turn the unambiguous ones into seek links. */
  const TIME = /\b(at|around|by|near|until|through|from|between|after|before)?\s?(\d{1,3}\.\d{1,2})(?:\s?(?:–|-|to|and)\s?(\d{1,3}\.\d{1,2}))?(\s?(?:seconds?|s)\b)?/g;
  const TIME_ZH = /()(\d{1,3}\.\d{1,2})(?:\s?(?:–|-|到|至|和)\s?(\d{1,3}\.\d{1,2}))?(\s?秒)/g;
  const showMoment = (player, time) => {
    player.pause();
    player.seek(time);
    const box = player.screen.getBoundingClientRect();
    if (box.bottom < 120 || box.top > innerHeight - 120) player.node.scrollIntoView({ block: "center" });
  };
  const seekLink = (label, time, player) => el("button", {
    class: "time-link", type: "button", text: label, "aria-label": fill(tr("Seek to {s} seconds"), { s: time }),
    onclick: () => showMoment(player, time),
  });
  const renderReason = (text, clip, player) => {
    const parts = [];
    let cursor = 0;
    for (const match of text.matchAll(lang === "zh" ? TIME_ZH : TIME)) {
      const [whole, prefix, first, , unit] = match;
      const before = text.slice(Math.max(0, match.index - 14), match.index).toLowerCase();
      if (!(prefix || unit) || /(within|roughly|offset of|interval of|about|approximately)\s*$/.test(before)) continue;
      const time = parseFloat(first);
      if (time >= clip.duration) continue;
      const start = match.index + (prefix ? prefix.length + 1 : whole.length - whole.trimStart().length);
      parts.push(text.slice(cursor, start));
      parts.push(seekLink(text.slice(start, match.index + whole.length).trim(), time, player));
      cursor = match.index + whole.length;
    }
    parts.push(text.slice(cursor));
    return parts;
  };

  const renderTally = (box, clip) => {
    const checks = outcomes(clip);
    box.textContent = fill(tr("{pass} of {total} outcome checks pass"), { pass: passes(checks), total: checks.length });
    if (clip.group === "hidden") box.append(el("small", { text: tr("The agent never saw this one.") }));
  };

  /* The eval example: a recording the agent never saw, with every one of the judge's checks, passes and failures, in the order they happen.
     Each folds open on its reason, and the current one follows playback. Checks whose reason names no time come last. */
  const exampleClip = celesteClip("ckpt0-berry");
  const examplePlayer = new ComparePlayer($("#example-player"));
  const exampleChecks = exampleClip.verdicts
    .map((verdict) => ({ verdict, at: parseFloat(verdict.r.match(/\d+\.\d+/)?.[0]) || null }))
    .sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || (b.verdict.focus === "Outcome") - (a.verdict.focus === "Outcome"));
  const timedChecks = exampleChecks.filter(({ at }) => at !== null);
  const openChecks = new Set();
  let exampleNow = Math.max(0, exampleChecks.findIndex(({ verdict }) => verdict.title === "Berry contact"));
  const showExampleNow = () => {
    [...$("#example-checks").children].forEach((row, index) => {
      const summary = row.firstChild.firstChild;
      if (index === exampleNow) summary.setAttribute("aria-current", "true");
      else summary.removeAttribute("aria-current");
    });
  };
  const followExample = () => {
    const t = examplePlayer.video.currentTime + 0.05;
    const moment = timedChecks.findLast(({ at }) => at <= t) ?? timedChecks[0];
    if (exampleChecks[exampleNow].at === moment.at) return;
    exampleNow = exampleChecks.findIndex(({ at }) => at === moment.at);
    showExampleNow();
  };
  const renderExample = () => {
    renderTally($("#example-tally"), exampleClip);
    $("#example-checks").replaceChildren(...exampleChecks.map(({ verdict, at }, index) => el("li", {},
      el("details", {
        class: "check",
        ontoggle: (event) => (event.currentTarget.open ? openChecks.add(verdict.title) : openChecks.delete(verdict.title)),
        ...(openChecks.has(verdict.title) ? { open: "" } : {}),
      },
      el("summary", { onclick: (event) => {
        if (event.currentTarget.parentElement.open || at === null) return;
        exampleNow = index;
        showExampleNow();
        examplePlayer.pause();
        examplePlayer.seek(at);
      } },
      el("span", { class: "verdict__chip", "data-v": verdict.v, text: tr(verdict.v) }),
      el("span", { class: "check__name" }, el("b", { text: tr(verdict.title, `check:${verdict.title}`) }), el("small", { text: tr(verdict.focus) })),
      el("span", { class: "check__at", text: at === null ? "" : clock(at) }),
      icon("chevron")),
      el("div", { class: "check__why" }, el("b", { text: tr("Judge: ") }), ...renderReason(tr(verdict.r, `why:${verdict.title}`), exampleClip, examplePlayer))))));
    showExampleNow();
    $("#example-note").textContent = tr("Outcome: did the same thing happen? Visual: does it look the same? The agent draws its own art.");
  };
  renderExample();
  onLanguage.push(renderExample);
  examplePlayer.onSync = () => { if (!examplePlayer.video.paused) followExample(); };
  examplePlayer.video.addEventListener("seeked", followExample);
  examplePlayer.load(exampleClip, { play: !reducedMotion });
})();
