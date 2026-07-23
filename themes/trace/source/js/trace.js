(() => {
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

  const setupCodeCopy = () => {
    const blocks = document.querySelectorAll(
      ".article-content pre, .article-content .highlight"
    );
    if (!blocks.length || !navigator.clipboard) return;

    blocks.forEach((block) => {
      const code = block.querySelector("code");
      const source = code ? code.innerText : block.innerText;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "code-copy";
      button.setAttribute("aria-label", "复制代码");
      button.textContent = "复制";
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(source);
          button.textContent = "已复制";
        } catch {
          button.textContent = "失败";
        }
        setTimeout(() => (button.textContent = "复制"), 1500);
      });

      block.appendChild(button);
    });
  };

  setupReadingProgress();
  setupToc();
  setupSearch();
  setupCodeCopy();
})();
