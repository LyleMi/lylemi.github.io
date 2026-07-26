(() => {
  const setupTheme = () => {
    const button = document.querySelector("[data-theme-toggle]");
    const metaColor = document.querySelector("#meta-theme-color");
    if (!button) return;

    const colors = { dark: "#0b0f13", light: "#f6f5ef" };

    const current = () =>
      document.documentElement.dataset.theme === "light" ? "light" : "dark";

    const apply = (theme, persist) => {
      if (theme === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
      button.textContent = theme === "light" ? "[dark]" : "[light]";
      if (metaColor) metaColor.setAttribute("content", colors[theme]);
      if (persist) {
        try {
          localStorage.setItem("trace-theme", theme);
        } catch {}
      }
    };

    apply(current(), false);
    button.addEventListener("click", () =>
      apply(current() === "light" ? "dark" : "light", true)
    );
  };

  const setupReadingProgress = () => {
    const progress = document.querySelector("#read-progress");
    if (!progress || !document.querySelector(".post-page")) return;

    let ticking = false;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      progress.style.width = `${ratio * 100}%`;
      ticking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  };

  const setupToc = () => {
    const headings = [...document.querySelectorAll(".article-content h2[id], .article-content h3[id]")];
    const links = [...document.querySelectorAll(".post-toc a[href^='#']")];
    if (!headings.length || !links.length || !("IntersectionObserver" in window)) return;

    const linksById = new Map(
      links.map((link) => [decodeURIComponent(link.hash.slice(1)), link])
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible[0]) return;
        links.forEach((link) => link.classList.remove("is-active"));
        linksById.get(visible[0].target.id)?.classList.add("is-active");
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );

    headings.forEach((heading) => observer.observe(heading));
  };

  const setupSearch = () => {
    const dialog = document.querySelector("#search-dialog");
    const input = document.querySelector("#search-input");
    const results = document.querySelector("#search-results");
    const status = document.querySelector("#search-status");
    const dataNode = document.querySelector("#search-data");

    if (!dialog || !input || !results || !status || !dataNode) return;

    let posts = [];
    try {
      posts = JSON.parse(dataNode.textContent);
    } catch {
      status.textContent = "搜索索引不可用。";
      return;
    }

    const normalize = (value) => String(value || "").toLocaleLowerCase("zh-CN").trim();

    const render = (query) => {
      const normalized = normalize(query);
      results.replaceChildren();

      if (!normalized) {
        status.textContent = "输入关键词开始搜索。";
        return;
      }

      const matches = posts
        .map((post) => {
          const title = normalize(post.title);
          const tags = normalize((post.tags || []).join(" "));
          let score = 0;
          if (title === normalized) score += 10;
          if (title.startsWith(normalized)) score += 6;
          if (title.includes(normalized)) score += 4;
          if (tags.includes(normalized)) score += 2;
          return { post, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      status.textContent = matches.length
        ? `找到 ${matches.length} 篇文章。`
        : "没有找到相关文章。";

      matches.forEach(({ post }) => {
        const item = document.createElement("li");
        item.className = "search-result";

        const link = document.createElement("a");
        link.href = post.url;

        const time = document.createElement("time");
        time.textContent = post.date;

        const title = document.createElement("strong");
        title.textContent = post.title;

        const tags = document.createElement("span");
        tags.className = "search-result__tags";
        tags.textContent = (post.tags || []).slice(0, 2).join(" · ");

        link.append(time, title, tags);
        item.append(link);
        results.append(item);
      });
    };

    const open = () => {
      if (typeof dialog.showModal === "function") {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
      requestAnimationFrame(() => input.focus());
    };

    const close = () => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };

    document.querySelectorAll("[data-search-open]").forEach((button) => {
      button.addEventListener("click", open);
    });
    document.querySelector("[data-search-close]")?.addEventListener("click", close);
    input.addEventListener("input", (event) => render(event.target.value));

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        open();
      }
    });
  };

  const setupCodeToolbar = () => {
    const selector = ".article-content > pre, .article-content > .highlight";
    const blocks = document.querySelectorAll(selector);
    if (!blocks.length || !navigator.clipboard) return;

    const langMap = {
      javascript: "js", typescript: "ts", python: "py", ruby: "rb",
      shell: "sh", bash: "sh", console: "console", diff: "diff",
      json: "json", yaml: "yaml", xml: "xml", html: "html", css: "css",
      "c++": "cpp", "c#": "csharp", objectivec: "objc",
    };

    const langLabel = (block) => {
      if (block.classList.contains("highlight")) {
        for (const cls of block.classList) {
          if (cls !== "highlight" && !cls.startsWith("is-")) {
            const mapped = langMap[cls] || cls;
            if (mapped === "plain" || mapped === "plaintext" || mapped === "none" || mapped === "text") return "";
            return mapped;
          }
        }
      }
      const code = block.querySelector("code");
      if (code && code.className) {
        const m = code.className.match(/lang(uage)?-(\w+)/);
        if (m) {
          const mapped = langMap[m[2]] || m[2];
          if (mapped === "plain" || mapped === "plaintext" || mapped === "none" || mapped === "text") return "";
          return mapped;
        }
      }
      return "";
    };

    const foldThreshold = 25;

    blocks.forEach((block) => {
      // extract code text
      const code = block.querySelector("code");
      const source = code ? code.innerText : block.innerText;

      // --- toolbar ---
      const toolbar = document.createElement("div");
      toolbar.className = "code-toolbar";

      const lang = document.createElement("span");
      lang.className = "code-toolbar__lang";
      lang.textContent = langLabel(block);
      toolbar.appendChild(lang);

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "code-toolbar__copy";
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(source);
          copyBtn.textContent = "✓ 已复制";
          copyBtn.classList.add("is-copied");
        } catch {
          copyBtn.textContent = "✗ 失败";
        }
        setTimeout(() => {
          copyBtn.textContent = "复制";
          copyBtn.classList.remove("is-copied");
        }, 1500);
      });
      toolbar.appendChild(copyBtn);

      block.parentNode.insertBefore(toolbar, block.nextSibling);
      // toolbar goes BEFORE the code block for stacking order
      block.parentNode.insertBefore(toolbar, block);

      // --- diff highlighting ---
      if (lang.textContent === "diff" || lang.textContent === "console") {
        const lines = block.querySelectorAll(".highlight .line");
        lines.forEach((line) => {
          const text = line.textContent;
          if (text.startsWith("+")) line.classList.add("add");
          else if (text.startsWith("-")) line.classList.add("remove");
          else if (text.startsWith("$")) {
            line.style.opacity = "0.65";
            const dollar = document.createElement("span");
            dollar.style.color = "var(--amber)";
            dollar.textContent = "$";
            line.insertBefore(dollar, line.firstChild);
            line.textContent = line.textContent.slice(1);
          }
        });
      }

      // --- code folding ---
      const lineCount = source.split("\n").length;
      if (lineCount > foldThreshold) {
        block.classList.add("is-foldable");

        const overlay = document.createElement("div");
        overlay.className = "code-fold-overlay";
        block.appendChild(overlay);

        const foldBtn = document.createElement("button");
        foldBtn.type = "button";
        foldBtn.className = "code-fold-btn";
        foldBtn.addEventListener("click", () => {
          const expanded = block.classList.toggle("is-expanded");
          foldBtn.classList.toggle("is-expanded", expanded);
          overlay.classList.toggle("is-hidden", expanded);
        });
        block.appendChild(foldBtn);
      }
    });
  };

  const setupPathIndicator = () => {
    const indicator = document.querySelector("#path-indicator");
    const pathEl = document.querySelector("#path-indicator-path");
    if (!indicator || !pathEl) return;

    const update = () => {
      const path = window.location.pathname;
      pathEl.textContent = path === "/" ? "~" : `~${path}`;
    };

    update();
    window.addEventListener("popstate", update);
  };

  // 猫猫糕：阮·梅造物，开拓者款（崩坏：星穹铁道）
  const setupTrailblazerCatCake = () => {
    const root = document.querySelector("#trailblazer-cat-cake");
    const button = root?.querySelector(".trailblazer-cat-cake__btn");
    const bubble = root?.querySelector("#trailblazer-cat-cake-bubble");
    if (!root || !button || !bubble) return;

    const quotes = [
      "规则——就是用来打破的",
      "生命因何而沉睡？因为被窝很温暖",
      "不要的漏洞可以塞给我喵",
      "垃圾桶……永远的家",
      "“我什么都做不到",
      "愿此行，终抵群星"
    ];

    let lastIndex = -1;
    let hideTimer = 0;

    const show = (text) => {
      bubble.textContent = text;
      bubble.classList.add("is-show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => bubble.classList.remove("is-show"), 4000);
    };

    button.addEventListener("click", () => {
      let index = Math.floor(Math.random() * quotes.length);
      if (index === lastIndex) index = (index + 1) % quotes.length;
      lastIndex = index;
      show(quotes[index]);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") bubble.classList.remove("is-show");
    });

    // 初次见面打个招呼
    setTimeout(() => show(quotes[0]), 1400);
  };

  // 返回顶部
  const setupBackToTop = () => {
    const btn = document.querySelector("#back-to-top");
    if (!btn) return;

    let ticking = false;
    const update = () => {
      btn.classList.toggle("is-visible", window.scrollY > 600);
      ticking = false;
    };

    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    update();

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  // 锚点平滑滚动（仅对 # 链接生效）
  const setupSmoothScrollAnchors = () => {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href^='#']");
      // 跳转链接交给浏览器原生行为（skip-link 需要原生焦点移动）
      if (!link || link.hash.length <= 1 || link.classList.contains("skip-link")) return;
      // hash 是 percent-encoded（如 #1-%E8%83%8C%E6%99%AF），不能直接喂给 querySelector
      let id;
      try {
        id = decodeURIComponent(link.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", link.hash);
    });
  };

  // 图片全屏预览
  const setupImageLightbox = () => {
    const lightbox = document.querySelector("#img-lightbox");
    const lightboxImg = lightbox?.querySelector("img");
    const closeBtn = lightbox?.querySelector(".img-lightbox__close");
    if (!lightbox || !lightboxImg || !closeBtn) return;

    const isImageHref = (href) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(href);

    document.addEventListener("click", (event) => {
      const img = event.target.closest(".article-content img");
      if (!img) return;
      // 图片包在链接里时：指向图片则预览原图，指向页面则不拦截
      const link = img.closest("a[href]");
      if (link) {
        const href = link.getAttribute("href") || "";
        if (!isImageHref(href)) return;
        event.preventDefault();
        lightboxImg.src = link.href;
      } else {
        lightboxImg.src = img.src;
      }
      lightboxImg.alt = img.alt || "";
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
    });

    const close = () => {
      if (!lightbox.classList.contains("is-open")) return;
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    };

    closeBtn.addEventListener("click", close);
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  };

  // 宽表格包一层横向滚动容器
  const setupTableScroll = () => {
    document.querySelectorAll(".article-content table").forEach((table) => {
      const wrapper = document.createElement("div");
      wrapper.className = "table-scroll";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  };

  setupTheme();
  setupReadingProgress();
  setupToc();
  setupSearch();
  setupCodeToolbar();
  setupPathIndicator();
  setupBackToTop();
  setupSmoothScrollAnchors();
  setupImageLightbox();
  setupTableScroll();
  setupTrailblazerCatCake();
})();
