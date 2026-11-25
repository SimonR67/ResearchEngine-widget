(function () {
  "use strict";
  var C = window.RE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  // All database and web-sourced text is rendered with textContent only (never innerHTML).
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }
  function setStatus(msg, isErr) { var s = $("status"); s.textContent = msg || ""; s.className = "msg" + (isErr ? " err" : ""); }

  if (!C.supabaseUrl || C.supabaseUrl.indexOf("PASTE_") === 0 || !C.supabaseAnonKey || C.supabaseAnonKey.indexOf("PASTE_") === 0) {
    $("login").hidden = false;
    $("signin").disabled = true;
    $("loginmsg").textContent = "Not configured yet: add the Supabase URL and anon key to config.js.";
    $("loginmsg").className = "msg err";
    return;
  }

  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true }
  });
  var db = sb.schema("rmi");
  var state = { rows: [], snaps: [], tab: "candidates" };

  function isOwner(session) {
    var u = session && session.user;
    return !!u && (u.email || "").toLowerCase() === C.ownerEmail.toLowerCase();
  }

  async function route(session) {
    $("login").hidden = true; $("app").hidden = true; $("userbox").hidden = true;
    if (!session) { $("login").hidden = false; return; }
    if (!isOwner(session)) {
      await sb.auth.signOut();
      $("login").hidden = false;
      $("loginmsg").textContent = "That Google account is not authorised.";
      $("loginmsg").className = "msg err";
      return;
    }
    $("useremail").textContent = session.user.email;
    $("userbox").hidden = false; $("app").hidden = false;
    await loadAll();
  }

  $("signin").addEventListener("click", function () {
    sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account", login_hint: C.ownerEmail } } });
  });
  $("signout").addEventListener("click", async function () { await sb.auth.signOut(); });
  sb.auth.onAuthStateChange(function (_e, session) { setTimeout(function () { route(session); }, 0); });
  sb.auth.getSession().then(function (r) { route(r.data.session); });

  document.querySelectorAll("#tabs button").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
  });
  function showTab(t) {
    state.tab = t;
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === t); });
    document.querySelectorAll(".tab").forEach(function (d) { d.hidden = d.id !== "tab-" + t; });
    if (t === "market") renderMarket();
    if (t === "digests") renderDigests();
  }

  async function loadAll() {
    setStatus("Loading...");
    var w = await db.from("watchlist").select("entity_id,status,origin,rationale,discovery_score,notes,proposed_at,status_changed_at,entities(name,domain,country,segment,ftse_index,ticker)").order("discovery_score", { ascending: false, nullsFirst: false });
    if (w.error) { setStatus("Could not load the watchlist: " + w.error.message, true); return; }
    state.rows = w.data || [];
    var since = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
    var s = await db.from("snapshots").select("entity_id,snapshot_date,metric,value,unit").gte("snapshot_date", since).order("snapshot_date", { ascending: true }).limit(5000);
    state.snaps = s.error ? [] : (s.data || []);
    setStatus("");
    renderLists();
    showTab(state.tab);
  }

  function by(status) { return state.rows.filter(function (r) { return r.status === status; }); }

  function renderLists() {
    ["proposed", "tracked", "dropped"].forEach(function (s) { $("n-" + s).textContent = "(" + by(s).length + ")"; });
    fill("tab-candidates", by("proposed"), "proposed", "No candidates waiting for review.");
    fill("tab-tracked", by("tracked"), "tracked", "Nothing tracked yet. Approve a candidate to start tracking it.");
    fill("tab-dropped", by("dropped"), "dropped", "No dropped companies.");
  }

  function fill(id, rows, status, emptyMsg) {
    var box = $(id); box.textContent = "";
    if (!rows.length) { box.appendChild(el("div", { class: "empty", text: emptyMsg })); return; }
    rows.forEach(function (r) { box.appendChild(card(r, status)); });
  }

  function latestMetrics(entityId) {
    var m = {};
    state.snaps.filter(function (x) { return x.entity_id === entityId; }).forEach(function (x) {
      (m[x.metric] = m[x.metric] || []).push(x);
    });
    return Object.keys(m).map(function (k) {
      var a = m[k], last = a[a.length - 1], weekAgo = null, cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      a.forEach(function (p) { if (p.snapshot_date <= cutoff) weekAgo = p; });
      var change = weekAgo && Number(weekAgo.value) ? ((Number(last.value) - Number(weekAgo.value)) / Math.abs(Number(weekAgo.value))) * 100 : null;
      return { metric: k, value: last.value, unit: last.unit, change: change };
    });
  }

  function card(r, status) {
    var e = r.entities || {};
    var head = el("div", { class: "row" }, [
      el("div", null, [
        el("h3", { text: e.name || "Unknown" }),
        el("div", { class: "meta" }, [
          pill(e.country), pill(e.segment), e.ftse_index && e.ftse_index !== "other" ? pill(e.ftse_index) : null,
          e.ticker ? pill(e.ticker) : null, e.domain ? pill(e.domain) : null, r.origin === "manual" ? pill("manual") : null
        ])
      ]),
      r.discovery_score != null ? el("div", { class: "score", title: "Fit score out of 100", text: String(Math.round(Number(r.discovery_score))) }) : null
    ]);
    var c = el("div", { class: "card" }, [head]);
    if (r.rationale) c.appendChild(el("div", { class: "meta", text: r.rationale }));
    if (r.notes) c.appendChild(el("div", { text: "Notes: " + r.notes }));

    if (status === "tracked") {
      var ms = latestMetrics(r.entity_id);
      c.appendChild(ms.length ? metricsTable(ms) : el("div", { class: "meta", text: "No daily metrics collected yet." }));
    }

    var sigBox = el("div");
    var actions = el("div", { class: "actions" });
    if (status === "proposed") {
      actions.appendChild(btn("Approve and track", "good", function () { setStatusFor(r.entity_id, "tracked"); }));
      actions.appendChild(btn("Reject", "bad", function () { setStatusFor(r.entity_id, "dropped"); }));
    } else if (status === "tracked") {
      actions.appendChild(btn("Stop tracking", "bad", function () { setStatusFor(r.entity_id, "dropped"); }));
    } else {
      actions.appendChild(btn("Restore to candidates", "", function () { setStatusFor(r.entity_id, "proposed"); }));
    }
    actions.appendChild(btn("Signals", "ghost", function () { toggleSignals(r.entity_id, sigBox); }));
    actions.appendChild(btn("Notes", "ghost", function () { editNotes(r, c); }));
    c.appendChild(actions);
    c.appendChild(sigBox);
    return c;
  }

  function pill(t) { return t ? el("span", { class: "pill", text: String(t) }) : null; }
  function btn(label, cls, fn) { return el("button", { class: cls, text: label, onclick: fn }); }

  function metricsTable(ms) {
    var tb = el("table", null, [el("thead", null, [el("tr", null, [el("th", { text: "Metric" }), el("th", { text: "Latest" }), el("th", { text: "7d change" })])])]);
    var body = el("tbody");
    ms.forEach(function (m) {
      var ch = m.change == null ? "n/a" : (m.change >= 0 ? "+" : "") + m.change.toFixed(1) + "%";
      body.appendChild(el("tr", null, [
        el("td", { text: m.metric }),
        el("td", { class: "num", text: String(m.value) + (m.unit ? " " + m.unit : "") }),
        el("td", { class: "num " + (m.change == null ? "" : m.change >= 0 ? "up" : "down"), text: ch })
      ]));
    });
    tb.appendChild(body); return tb;
  }

  async function setStatusFor(id, status) {
    setStatus("Saving...");
    var r = await db.from("watchlist").update({ status: status }).eq("entity_id", id);
    if (r.error) { setStatus("Could not save: " + r.error.message, true); return; }
    await loadAll();
    setStatus("Saved.");
  }

  async function toggleSignals(id, box) {
    if (box.childNodes.length) { box.textContent = ""; return; }
    box.appendChild(el("div", { class: "meta", text: "Loading signals..." }));
    var r = await db.from("signals").select("event_date,source,signal_type,summary,url").eq("entity_id", id).order("event_date", { ascending: false, nullsFirst: false }).limit(12);
    box.textContent = "";
    if (r.error) { box.appendChild(el("div", { class: "msg err", text: r.error.message })); return; }
    if (!r.data.length) { box.appendChild(el("div", { class: "meta", text: "No signals recorded." })); return; }
    var ul = el("ul", { class: "sigs" });
    r.data.forEach(function (s) {
      var li = el("li", { text: (s.event_date || "undated") + " | " + s.source + " | " + s.signal_type + ": " + (s.summary || "") + " " });
      var u = safeUrl(s.url);
      if (u) li.appendChild(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: "source" }));
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function editNotes(r, cardEl) {
    if (cardEl.querySelector("textarea")) return;
    var ta = el("textarea", { maxlength: "2000" }); ta.value = r.notes || "";
    var save = btn("Save notes", "primary", async function () {
      var x = await db.from("watchlist").update({ notes: ta.value }).eq("entity_id", r.entity_id);
      if (x.error) setStatus("Could not save notes: " + x.error.message, true); else { await loadAll(); setStatus("Saved."); }
    });
    cardEl.appendChild(ta); cardEl.appendChild(el("div", { class: "actions" }, [save]));
  }

  async function renderMarket() {
    var box = $("tab-market"); box.textContent = "";
    var r = await db.from("market_series").select("series,obs_date,value,source").order("obs_date", { ascending: false }).limit(2000);
    if (r.error) { box.appendChild(el("div", { class: "msg err", text: r.error.message })); return; }
    if (!r.data.length) { box.appendChild(el("div", { class: "empty", text: "No market data yet. Price and macro collectors have not been connected." })); return; }
    var latest = {}, prev = {};
    r.data.forEach(function (x) { if (!latest[x.series]) latest[x.series] = x; else if (!prev[x.series]) prev[x.series] = x; });
    var tb = el("table", null, [el("thead", null, [el("tr", null, [el("th", { text: "Series" }), el("th", { text: "Date" }), el("th", { text: "Value" }), el("th", { text: "Change" }), el("th", { text: "Source" })])])]);
    var body = el("tbody");
    Object.keys(latest).sort().forEach(function (k) {
      var a = latest[k], p = prev[k], ch = p && Number(p.value) ? ((Number(a.value) - Number(p.value)) / Math.abs(Number(p.value))) * 100 : null;
      body.appendChild(el("tr", null, [
        el("td", { text: k }), el("td", { text: a.obs_date }), el("td", { class: "num", text: String(a.value) }),
        el("td", { class: "num " + (ch == null ? "" : ch >= 0 ? "up" : "down"), text: ch == null ? "n/a" : (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%" }),
        el("td", { text: a.source || "" })
      ]));
    });
    tb.appendChild(body); box.appendChild(tb);
  }

  async function renderDigests() {
    var box = $("tab-digests"); box.textContent = "";
    var r = await db.from("digests").select("kind,digest_date,subject,html").order("digest_date", { ascending: false }).limit(1);
    if (r.error) { box.appendChild(el("div", { class: "msg err", text: r.error.message })); return; }
    if (!r.data.length) { box.appendChild(el("div", { class: "empty", text: "No digests yet. The 07:30 digest has not been connected." })); return; }
    var d = r.data[0];
    box.appendChild(el("div", { class: "meta", text: d.kind + " digest, " + d.digest_date + (d.subject ? " | " + d.subject : "") }));
    // Sandboxed with no permissions: scripts and navigation in the digest HTML cannot run.
    var f = el("iframe", { sandbox: "", title: "Digest" });
    f.srcdoc = d.html || "";
    box.appendChild(f);
  }

  $("addform").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var f = ev.target, name = f.name.value.trim(), domain = f.domain.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (!name) return;
    if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) { setStatus("That domain does not look valid.", true); return; }
    setStatus("Adding...");
    var ins = await db.from("entities").insert({ name: name, domain: domain || null, country: f.country.value, segment: f.segment.value }).select("id").single();
    if (ins.error) { setStatus("Could not add (it may already exist): " + ins.error.message, true); return; }
    var w = await db.from("watchlist").insert({ entity_id: ins.data.id, status: "tracked", origin: "manual", rationale: "Added manually" });
    if (w.error) { setStatus("Could not add to the watchlist: " + w.error.message, true); return; }
    f.reset(); await loadAll(); setStatus("Added " + name + " to tracked.");
  });
})();
