// ============================================================
// App principal
// ============================================================

const IMPORTANCIA_PESO = { alta: 2, normal: 1, baixa: 0 };
const IMPORTANCIA_LABEL = { alta: "Alta", normal: "Normal", baixa: "Baixa" };
const SEM_CATEGORIA = "Sem categoria";

// Paleta rotativa pro estilo "pill colorida" do Eventos Haru — cada
// categoria recebe uma cor consistente, calculada a partir do nome.
const CORES_CATEGORIA = [
  { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB" }, // azul
  { bg: "#F0FDF4", border: "#BBF7D0", text: "#16A34A" }, // verde
  { bg: "#FDF4FF", border: "#F0ABFC", text: "#A21CAF" }, // magenta
  { bg: "#FFF7ED", border: "#FED7AA", text: "#C2410C" }, // laranja
  { bg: "#EEE9FE", border: "#DDD6FE", text: "#6B3FF6" }, // roxo (marca)
  { bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" }, // vermelho
  { bg: "#ECFEFF", border: "#A5F3FC", text: "#0E7490" }, // ciano
];

function corCategoria(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
  return CORES_CATEGORIA[hash % CORES_CATEGORIA.length];
}

let pendingItems = [];
let doneItems = [];
let sharedItems = [];
let otherProfiles = []; // [{id, nome}] — Amanda e Marcelo, do ponto de vista de quem logou
let profilesById = {};

const el = {
  input: document.getElementById("captureInput"),
  send: document.getElementById("captureSend"),
  nextContent: document.getElementById("nextContent"),
  nextStage: document.getElementById("nextStage"),
  listView: document.getElementById("listView"),
  sharedView: document.getElementById("sharedView"),
  pendingList: document.getElementById("pendingList"),
  doneList: document.getElementById("doneList"),
  sharedList: document.getElementById("sharedList"),
  navNext: document.getElementById("navNext"),
  navList: document.getElementById("navList"),
  navShared: document.getElementById("navShared"),
  logoutBtn: document.getElementById("logoutBtn"),
};

// ---------- Formatação ----------

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ---------- Navegação entre telas ----------

function showView(view) {
  el.nextStage.classList.toggle("hidden", view !== "next");
  el.listView.classList.toggle("active", view === "list");
  el.sharedView.classList.toggle("active", view === "shared");

  el.navNext.classList.toggle("active", view === "next");
  el.navList.classList.toggle("active", view === "list");
  el.navShared.classList.toggle("active", view === "shared");
}

el.navNext.addEventListener("click", () => showView("next"));
el.navList.addEventListener("click", () => showView("list"));
el.navShared.addEventListener("click", () => {
  showView("shared");
  refreshShared();
});

el.logoutBtn.addEventListener("click", async () => {
  notifications.stopLocalReminders();
  await db.signOut();
  window.location.reload();
});

// ---------- Captura ----------

el.input.addEventListener("input", () => {
  el.send.disabled = el.input.value.trim().length === 0;
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 120) + "px";
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitCapture();
  }
});

el.send.addEventListener("click", submitCapture);

async function submitCapture() {
  const texto = el.input.value.trim();
  if (!texto) return;

  el.input.value = "";
  el.input.style.height = "auto";
  el.send.disabled = true;

  try {
    const created = await db.createItem(texto);
    await refreshData();

    // Classificação roda em segundo plano — não trava a captura.
    db.classifyItem(created.id);

    // Primeira captura bem-sucedida é um bom momento pra pedir
    // permissão de notificação — já demonstrou valor antes de pedir algo.
    if (Notification.permission === "default") {
      const permission = await notifications.requestPermission();
      if (permission === "granted") {
        const sub = await notifications.subscribeToPush();
        if (sub) await db.savePushSubscription(sub.toJSON());
      }
    }
  } catch (err) {
    console.error("Erro ao salvar item:", err);
    el.input.value = texto;
  }
}

// ---------- Renderização: próximo item ----------

function renderNext() {
  const item = pendingItems[0];

  if (!item) {
    el.nextContent.innerHTML = `
      <div class="empty-state">
        <strong>Nada pendente agora.</strong>
        Escreva o que passar pela cabeça — vai aparecer aqui.
      </div>
    `;
    return;
  }

  const tags = [];
  if (item.categoria) {
    const cor = corCategoria(item.categoria);
    tags.push(`<span class="pill" style="background:${cor.bg};border-color:${cor.border};color:${cor.text};">${escapeHtml(item.categoria)}</span>`);
  }
  if (item.importancia === "alta") {
    tags.push(`<span class="pill" style="background:#FEF2F2;border-color:#FECACA;color:#DC2626;">Alta</span>`);
  }

  el.nextContent.innerHTML = `
    <div class="next-eyebrow">Próximo</div>
    <div class="next-card">
      <div class="next-card-text">${escapeHtml(item.texto_original)}</div>
      <div class="next-card-meta">Criado em ${formatDate(item.criado_em)} ${tags.join(" ")}</div>
      <div class="next-actions">
        <button id="btnPostpone">Depois</button>
        <button id="btnDone" class="btn-done">Feito</button>
      </div>
    </div>
  `;

  document.getElementById("btnDone").addEventListener("click", async () => {
    await db.markDone(item.id);
    await refreshData();
  });

  document.getElementById("btnPostpone").addEventListener("click", async () => {
    await db.postpone(item.id, item.vezes_adiado);
    pendingItems.push(pendingItems.shift());
    renderNext();
  });
}

// ---------- Renderização: lista completa, agrupada por categoria ----------

function agruparPorCategoria(items) {
  const grupos = new Map();
  for (const item of items) {
    const chave = item.categoria || SEM_CATEGORIA;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }
  // "Sem categoria" sempre por último, o resto em ordem alfabética
  const chaves = [...grupos.keys()].sort((a, b) => {
    if (a === SEM_CATEGORIA) return 1;
    if (b === SEM_CATEGORIA) return -1;
    return a.localeCompare(b, "pt-BR");
  });
  return chaves.map((chave) => ({ categoria: chave, items: grupos.get(chave) }));
}

function renderList() {
  const grupos = agruparPorCategoria(pendingItems);

  el.pendingList.innerHTML =
    `<div class="list-section-title">Pendentes (${pendingItems.length})</div>` +
    grupos.map((grupo) => {
      const cor = grupo.categoria !== SEM_CATEGORIA ? corCategoria(grupo.categoria) : null;
      const headingStyle = cor ? `color:${cor.text};` : "";
      return `
      <div class="category-group">
        <div class="category-heading" style="${headingStyle}">${escapeHtml(grupo.categoria)}</div>
        ${grupo.items.map((item) => renderItemCard(item, { withShare: true, withMeta: true })).join("")}
      </div>
    `;
    }).join("");

  el.doneList.innerHTML = doneItems.length
    ? `<div class="list-section-title">Concluídos</div>` +
      doneItems.map((item) => renderItemCard(item, { withShare: false, withMeta: false })).join("")
    : "";

  wireItemCardEvents(el.pendingList);
  wireItemCardEvents(el.doneList);
}

function renderShared() {
  if (sharedItems.length === 0) {
    el.sharedList.innerHTML = `
      <div class="empty-state" style="margin: 40px auto;">
        <strong>Nada compartilhado com você ainda.</strong>
      </div>
    `;
    return;
  }

  el.sharedList.innerHTML =
    `<div class="list-section-title">Compartilhados com você</div>` +
    sharedItems.map((item) => {
      const donoNome = profilesById[item.owner_id]?.nome || "alguém";
      const done = item.status === "feito";
      return `
        <div class="item-card">
          <div class="item-body">
            <div class="item-text ${done ? "done" : ""}">${escapeHtml(item.texto_original)}</div>
            <div class="item-meta">
              <span>De ${escapeHtml(donoNome)} · ${formatDate(item.criado_em)}</span>
              ${done ? '<span class="tag">concluído</span>' : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");
}

function renderItemCard(item, opts) {
  const withShare = opts && opts.withShare;
  const withMeta = opts ? opts.withMeta !== false : true;
  const done = item.status === "feito";
  const checkAttr = done ? `data-uncheck="${item.id}"` : `data-check="${item.id}"`;
  const meta = done
    ? `Criado ${formatDate(item.criado_em)} · Concluído ${formatDate(item.concluido_em)}`
    : `Criado ${formatDate(item.criado_em)}`;

  const tags = [];
  if (item.tipo) tags.push(`<span class="tag">${item.tipo}</span>`);
  if (item.data_sugerida) tags.push(`<span class="tag">prazo: ${formatDate(item.data_sugerida)}</span>`);
  if (item.notas_ia) tags.push(`<span class="tag">${escapeHtml(item.notas_ia)}</span>`);

  const importanciaAtual = item.importancia || "normal";
  const corCat = item.categoria ? corCategoria(item.categoria) : null;
  const categoriaStyle = corCat ? `background:${corCat.bg};border-color:${corCat.border};color:${corCat.text};` : "";

  const importanciaRow = withMeta ? `
    <div class="tags-row">
      ${["baixa", "normal", "alta"].map((nivel) => `
        <button
          class="imp-pill imp-${nivel} ${importanciaAtual === nivel ? "imp-active" : ""}"
          data-importancia="${item.id}"
          data-nivel="${nivel}"
        >${IMPORTANCIA_LABEL[nivel]}</button>
      `).join("")}
      <button class="category-edit-btn" data-category-edit="${item.id}" style="${categoriaStyle}">
        ${item.categoria ? escapeHtml(item.categoria) : "+ categoria"}
      </button>
    </div>
  ` : "";

  const shareChips = withShare && otherProfiles.length > 0
    ? `<div class="share-row">` +
        otherProfiles.map((p) => {
          const active = (item.compartilhado_com || []).includes(p.id);
          return `<button class="chip ${active ? "chip-active" : ""}" data-share="${item.id}" data-person="${p.id}">${escapeHtml(p.nome)}</button>`;
        }).join("") +
      `</div>`
    : "";

  return `
    <div class="item-card">
      <button class="item-check ${done ? "checked" : ""}" ${checkAttr} aria-label="Marcar"></button>
      <div class="item-body">
        <div class="item-text ${done ? "done" : ""}">${escapeHtml(item.texto_original)}</div>
        <div class="item-meta">
          <span>${meta}</span>
          ${tags.join("")}
        </div>
        ${importanciaRow}
        ${shareChips}
      </div>
    </div>
  `;
}

function categoriasConhecidas() {
  const todas = [...pendingItems, ...doneItems]
    .map((i) => i.categoria)
    .filter(Boolean);
  return [...new Set(todas)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function abrirSeletorCategoria(itemId, anchorEl) {
  document.querySelectorAll(".category-popover").forEach((p) => p.remove());

  const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
  if (!item) return;

  const conhecidas = categoriasConhecidas();

  const popover = document.createElement("div");
  popover.className = "category-popover";
  popover.innerHTML = `
    ${conhecidas.map((c) => {
      const cor = corCategoria(c);
      return `<button class="chip category-option" data-set-category="${escapeHtml(c)}" style="background:${cor.bg};border-color:${cor.border};color:${cor.text};">${escapeHtml(c)}</button>`;
    }).join("")}
    <div class="category-new-row">
      <input type="text" class="category-new-input" placeholder="nova categoria" value="${item.categoria ? escapeHtml(item.categoria) : ""}">
      <button class="category-save-btn">OK</button>
    </div>
  `;

  anchorEl.parentElement.appendChild(popover);

  popover.querySelectorAll("[data-set-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await salvarCategoria(itemId, btn.dataset.setCategory);
      popover.remove();
    });
  });

  const input = popover.querySelector(".category-new-input");
  const salvar = async () => {
    const valor = input.value.trim();
    await salvarCategoria(itemId, valor || null);
    popover.remove();
  };
  popover.querySelector(".category-save-btn").addEventListener("click", salvar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); salvar(); }
  });

  // fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener("click", function onClickOutside(e) {
      if (!popover.contains(e.target) && e.target !== anchorEl) {
        popover.remove();
        document.removeEventListener("click", onClickOutside);
      }
    });
  }, 0);
}

async function salvarCategoria(itemId, categoria) {
  const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
  if (item) item.categoria = categoria;
  try {
    await db.updateCategoria(itemId, categoria);
    renderList();
  } catch (err) {
    console.error("Erro ao salvar categoria:", err);
  }
}

function wireItemCardEvents(container) {
  container.querySelectorAll("[data-check]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await db.markDone(btn.dataset.check);
      await refreshData();
    });
  });

  container.querySelectorAll("[data-uncheck]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await db.markUndone(btn.dataset.uncheck);
      await refreshData();
    });
  });

  container.querySelectorAll("[data-importancia]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.importancia;
      const nivel = btn.dataset.nivel;
      const item = pendingItems.find((i) => i.id === itemId);
      if (!item) return;
      item.importancia = nivel;
      renderList();
      try {
        await db.updateImportancia(itemId, nivel);
        pendingItems = ordenarPorImportancia(pendingItems);
        renderNext();
      } catch (err) {
        console.error("Erro ao salvar importância:", err);
      }
    });
  });

  container.querySelectorAll("[data-category-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirSeletorCategoria(btn.dataset.categoryEdit, btn);
    });
  });

  container.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = btn.dataset.share;
      const personId = btn.dataset.person;
      const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
      if (!item) return;

      const atual = item.compartilhado_com || [];
      const novo = atual.includes(personId)
        ? atual.filter((id) => id !== personId)
        : [...atual, personId];

      btn.classList.toggle("chip-active");
      try {
        await db.updateSharing(itemId, novo);
        item.compartilhado_com = novo;
      } catch (err) {
        console.error("Erro ao compartilhar:", err);
        btn.classList.toggle("chip-active");
      }
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Ordenação ----------

function ordenarPorImportancia(items) {
  // Sort estável: mantém a ordem de prioridade/idade já vinda do banco,
  // só reordena por peso de importância por cima.
  return [...items].sort((a, b) => {
    const pa = IMPORTANCIA_PESO[a.importancia || "normal"];
    const pb = IMPORTANCIA_PESO[b.importancia || "normal"];
    return pb - pa;
  });
}

// ---------- Sincronização de dados ----------

async function refreshData() {
  const [pending, done] = await Promise.all([db.listPending(), db.listDone()]);
  pendingItems = ordenarPorImportancia(pending);
  doneItems = done;
  renderNext();
  renderList();
  notifications.updateBadge(pendingItems.length);
}

async function refreshShared() {
  sharedItems = await db.listSharedWithMe();
  const ownerIds = [...new Set(sharedItems.map((i) => i.owner_id))];
  const owners = await db.getProfilesByIds(ownerIds);
  owners.forEach((p) => (profilesById[p.id] = p));
  renderShared();
}

// ---------- Boot do app (chamado só depois do login) ----------

async function startApp() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.error("Falha ao registrar service worker:", err)
    );
  }

  otherProfiles = await db.listOtherProfiles();
  otherProfiles.forEach((p) => (profilesById[p.id] = p));

  await refreshData();
  db.onChange(() => {
    refreshData();
    if (el.sharedView.classList.contains("active")) refreshShared();
  });

  // Se a permissão já tinha sido concedida numa visita anterior,
  // garante que a inscrição de push ainda está salva no banco.
  if (Notification.permission === "granted") {
    const sub = await notifications.subscribeToPush();
    if (sub) db.savePushSubscription(sub.toJSON());
  }

  notifications.startLocalReminders(() => {
    return pendingItems[0] ? pendingItems[0].texto_original : null;
  });
}

auth.init(() => {
  startApp().catch((err) => {
    console.error("Erro ao iniciar o app:", err);
    el.nextContent.innerHTML = `
      <div class="empty-state">
        <strong>Não consegui conectar.</strong>
        Confira se a URL e a chave do Supabase estão certas em js/config.js.
      </div>
    `;
  });
});