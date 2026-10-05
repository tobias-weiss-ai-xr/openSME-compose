// openSME portal — client enhancements (served at /app.js, CSP: script-src 'self').
//
// 1. Fast-switch: Ctrl/Cmd+K palette with fuzzy filtering over the service
//    cards, keyboard navigation (up/down/enter/esc).
// 2. AI assistant: minimal ask-box wired to POST /api/ai/chat (same-origin,
//    so CSP connect-src 'self' holds). The endpoint is only mounted when the
//    operator configured AI_API_URL; the box is hidden otherwise.

(function () {
  "use strict";

  // ── Fast-switch palette ────────────────────────────────────────────
  var palette = document.createElement("div");
  palette.id = "palette";
  palette.hidden = true;
  palette.innerHTML =
    '<div class="pal-box" role="dialog" aria-label="Quick switch">' +
    '<input id="pal-input" type="text" placeholder="Jump to…" autocomplete="off" spellcheck="false">' +
    '<ul id="pal-list"></ul>' +
    '<p class="pal-hint">↑↓ navigate · Enter open · Esc close</p>' +
    "</div>";
  document.body.appendChild(palette);

  var input = palette.querySelector("#pal-input");
  var list = palette.querySelector("#pal-list");
  var entries = []; // {name, url, node}
  var selected = 0;

  function collectEntries() {
    entries = Array.prototype.map.call(
      document.querySelectorAll("a.card[data-pal]"),
      function (a) {
        return {
          name: (a.getAttribute("data-pal") || "").toLowerCase(),
          url: a.href,
          node: a,
        };
      }
    );
  }

  function render(query) {
    var q = (query || "").toLowerCase().trim();
    var hits = q
      ? entries.filter(function (e) {
          return e.name.indexOf(q) !== -1;
        })
      : entries;
    selected = Math.min(selected, Math.max(hits.length - 1, 0));
    list.innerHTML = "";
    hits.forEach(function (e, i) {
      var li = document.createElement("li");
      li.textContent = e.name;
      if (i === selected) li.classList.add("sel");
      li.addEventListener("mousedown", function (ev) {
        ev.preventDefault();
        window.open(e.url, "_blank", "noopener");
        close();
      });
      list.appendChild(li);
    });
    if (!hits.length) {
      var none = document.createElement("li");
      none.className = "none";
      none.textContent = "no match";
      list.appendChild(none);
    }
  }

  function open() {
    collectEntries();
    selected = 0;
    render("");
    palette.hidden = false;
    input.value = "";
    input.focus();
  }

  function close() {
    palette.hidden = true;
  }

  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      palette.hidden ? open() : close();
      return;
    }
    if (palette.hidden) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    } else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      var n = list.querySelectorAll("li:not(.none)").length;
      if (!n) return;
      selected = ev.key === "ArrowDown" ? (selected + 1) % n : (selected + n - 1) % n;
      render(input.value);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      var hit = list.querySelector("li.sel");
      if (hit) {
        var name = hit.textContent.toLowerCase();
        var e = entries.filter(function (x) { return x.name === name; })[0];
        if (e) {
          window.open(e.url, "_blank", "noopener");
          close();
        }
      }
    }
  });

  input.addEventListener("input", function () {
    selected = 0;
    render(input.value);
  });

  palette.addEventListener("mousedown", function (ev) {
    if (ev.target === palette) close();
  });

  var hint = document.createElement("button");
  hint.id = "pal-hint";
  hint.type = "button";
  hint.title = "Quick switch (Ctrl+K)";
  hint.textContent = "⌘K";
  hint.addEventListener("click", open);
  document.body.appendChild(hint);

  // ── AI assistant box ──────────────────────────────────────────────
  var aiCard = document.querySelector("#ai-card");
  if (aiCard) {
    var box = aiCard.querySelector(".ai-box");
    var q = aiCard.querySelector(".ai-q");
    var out = aiCard.querySelector(".ai-out");
    var ask = aiCard.querySelector(".ai-ask");
    if (box && q && out && ask) {
      ask.addEventListener("click", function () {
        var question = (q.value || "").trim();
        if (!question) return;
        out.textContent = "…";
        out.hidden = false;
        fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: question }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then(function (d) {
            out.textContent = d.answer || "(empty answer)";
          })
          .catch(function (err) {
            out.textContent = "AI unavailable: " + err.message;
          });
      });
      q.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ask.click();
        }
      });
    }
  }
})();
