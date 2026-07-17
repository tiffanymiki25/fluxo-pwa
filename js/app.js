// ============================================================
// App principal
// ============================================================

const IMPORTANCIA_PESO = { alta: 2, normal: 1, baixa: 0 };
const IMPORTANCIA_LABEL = { alta: "Alta", normal: "Normal", baixa: "Baixa" };
const SEM_CATEGORIA = "Sem categoria";

// Paleta rotativa — cada categoria recebe uma cor consistente,
// calculada a partir do nome.
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
let otherProfiles = []; // [{id, nome}] — Amanda e Marcelo, do ponto de vista de quem logou
let profilesById = {};
let meuNome = "";
let itemModalId = null; // item atualmente aberto no modal de detalhe
let filtroCategoriaAtiva = null; // categoria selecionada nos cards da Home, ou null = tudo

const el = {
  input: document.getElementById("captureInput"),
  send: document.getElementById("captureSend"),
  nextStage: document.getElementById("nextStage"),
  homeHero: document.getElementById("homeHero"),
  homeCategoryCards: document.getElementById("homeCategoryCards"),
  listView: document.getElementById("listView"),
  pendingList: document.getElementById("pendingList"),
  doneList: document.getElementById("doneList"),
  navNext: document.getElementById("navNext"),
  navList: document.getElementById("navList"),
  navPosts: document.getElementById("navPosts"),
  postsView: document.getElementById("postsView"),
  navCalendar: document.getElementById("navCalendar"),
  calendarView: document.getElementById("calendarView"),
  captureSection: document.querySelector(".capture"),
  logoutBtn: document.getElementById("logoutBtn"),
  modalBackdrop: document.getElementById("itemModalBackdrop"),
  modalBody: document.getElementById("itemModalBody"),
  modalClose: document.getElementById("itemModalClose"),
};

// ---------- Formatação ----------

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Navegação entre telas ----------

function showView(view) {
  el.nextStage.classList.toggle("hidden", view !== "next");
  el.listView.classList.toggle("active", view === "list");
  el.postsView.classList.toggle("active", view === "posts");
  el.calendarView.classList.toggle("active", view === "calendar");
  el.captureSection.style.display = (view === "posts" || view === "calendar") ? "none" : "block";

  el.navNext.classList.toggle("active", view === "next");
  el.navList.classList.toggle("active", view === "list");
  el.navPosts.classList.toggle("active", view === "posts");
  el.navCalendar.classList.toggle("active", view === "calendar");
}

el.navNext.addEventListener("click", () => showView("next"));
el.navList.addEventListener("click", () => showView("list"));
el.navPosts.addEventListener("click", () => {
  showView("posts");
  postagens.refresh();
});
el.navCalendar.addEventListener("click", () => {
  showView("calendar");
  calendario.refresh();
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

// ---------- Home: cards de categoria ----------

function renderHomeCards() {
  const contagem = new Map();
  pendingItems.forEach((item) => {
    const chave = item.categoria || SEM_CATEGORIA;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  });

  const categorias = [...contagem.keys()].sort((a, b) => {
    if (a === SEM_CATEGORIA) return 1;
    if (b === SEM_CATEGORIA) return -1;
    return a.localeCompare(b, "pt-BR");
  });

  const iconTag = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/></svg>`;

  const saudacao = meuNome ? `Olá, ${escapeHtml(meuNome.split(" ")[0])}` : "Olá";
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  el.homeHero.innerHTML = `
    <button class="home-hero ${filtroCategoriaAtiva === null ? "cat-card-active" : ""}" data-home-cat="todos">
      <img src="icons/icon-512.png" alt="Octa44 Hub" class="home-hero-logo">
      <div class="home-hero-text">
        <div class="home-hero-greeting">${saudacao}</div>
        <div class="home-hero-date">${escapeHtml(hoje)}</div>
      </div>
      <div class="home-hero-stat">
        <span class="home-hero-count">${pendingItems.length}</span>
        <span class="home-hero-label">pendentes</span>
      </div>
    </button>
  `;

  const cardsHtml = categorias.map((c) => {
    const cor = c === SEM_CATEGORIA ? { bg: "var(--neutral-bg)", text: "var(--text-dim)" } : corCategoria(c);
    const ativo = filtroCategoriaAtiva === c;
    return `
      <button class="cat-card ${ativo ? "cat-card-active" : ""}" data-home-cat="${escapeHtml(c)}" style="background:${cor.bg};">
        <span class="cat-card-icon" style="color:${cor.text};">${iconTag}</span>
        <span class="cat-card-count" style="color:${cor.text};">${contagem.get(c)}</span>
        <span class="cat-card-label">${escapeHtml(c)}</span>
      </button>
    `;
  }).join("");

  el.homeCategoryCards.innerHTML = cardsHtml || `
    <div class="empty-state" style="grid-column: 1 / -1; margin: 20px auto;">
      <strong>Nenhuma categoria ainda.</strong>
      Categorize um item pra ele aparecer aqui.
    </div>
  `;

  document.querySelectorAll("[data-home-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nome = btn.dataset.homeCat;
      filtroCategoriaAtiva = nome === "todos" ? null : nome;
      showView("list");
      renderList();
    });
  });
}

// ---------- Lista completa (linhas, inclui compartilhados) ----------

function dotsHtml(itemId, nivelAtual, size, interativo) {
  const cls = size === "lg" ? "dot dot-lg" : "dot";
  return ["baixa", "normal", "alta"].map((nivel) => `
    <button
      class="${cls} dot-${nivel} ${nivelAtual === nivel ? "active" : ""}"
      ${interativo ? `data-set-priority="${itemId}" data-nivel="${nivel}"` : "disabled"}
      title="Importância: ${IMPORTANCIA_LABEL[nivel]}"
      aria-label="Marcar importância ${IMPORTANCIA_LABEL[nivel]}"
    ></button>
  `).join("");
}

function renderItemRow(item) {
  const done = item.status === "feito";
  const isMine = item.owner_id === db.getUserId();
  const checkAttr = isMine ? (done ? `data-uncheck="${item.id}"` : `data-check="${item.id}"`) : "disabled";
  const cor = item.categoria ? corCategoria(item.categoria) : null;
  const stripe = cor ? cor.text : "transparent";
  const nivelAtual = item.importancia || "normal";

  const sub = [];
  if (item.data_sugerida) sub.push(`📅 ${formatDate(item.data_sugerida)}`);
  if (!isMine) {
    const nomeDono = profilesById[item.owner_id]?.nome || "alguém";
    sub.push(`compartilhado por ${escapeHtml(nomeDono)}`);
  }

  return `
    <div class="task-row" data-open-item="${item.id}" style="border-left-color:${stripe};">
      <button class="item-check ${done ? "checked" : ""} ${!isMine ? "item-check-disabled" : ""}" ${checkAttr} aria-label="Marcar"></button>
      <div class="task-row-main">
        <div class="task-row-title ${done ? "done" : ""}">${escapeHtml(item.texto_original)}</div>
        ${sub.length ? `<div class="task-row-sub">${sub.join(" · ")}</div>` : ""}
      </div>
      <div class="task-row-right">
        ${item.categoria ? `<span class="row-category" style="color:${cor.text};">${escapeHtml(item.categoria)}</span>` : ""}
        <div class="dots-row">${dotsHtml(item.id, nivelAtual, "sm", isMine)}</div>
      </div>
    </div>
  `;
}

function renderList() {
  const filtro = filtroCategoriaAtiva;
  const pendentesFiltrados = filtro
    ? pendingItems.filter((i) => (i.categoria || SEM_CATEGORIA) === filtro)
    : pendingItems;
  const doneFiltrados = filtro
    ? doneItems.filter((i) => (i.categoria || SEM_CATEGORIA) === filtro)
    : doneItems;

  const filtroChip = filtro
    ? `<div class="active-filter-chip">Categoria: <strong>${escapeHtml(filtro)}</strong> <button id="clearFilterBtn">✕</button></div>`
    : "";

  el.pendingList.innerHTML =
    filtroChip +
    `<div class="list-section-title">Pendentes (${pendentesFiltrados.length})</div>` +
    `<div class="task-list">${pendentesFiltrados.map(renderItemRow).join("")}</div>`;

  el.doneList.innerHTML = doneFiltrados.length
    ? `<div class="list-section-title">Concluídos</div><div class="task-list">${doneFiltrados.map(renderItemRow).join("")}</div>`
    : "";

  const clearBtn = document.getElementById("clearFilterBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      filtroCategoriaAtiva = null;
      renderList();
      renderHomeCards();
    });
  }

  wireRowEvents(el.pendingList);
  wireRowEvents(el.doneList);
}

function wireRowEvents(container) {
  container.querySelectorAll("[data-check]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await db.markDone(btn.dataset.check);
      await refreshData();
    });
  });

  container.querySelectorAll("[data-uncheck]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await db.markUndone(btn.dataset.uncheck);
      await refreshData();
    });
  });

  container.querySelectorAll("[data-set-priority]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await salvarImportancia(btn.dataset.setPriority, btn.dataset.nivel);
    });
  });

  container.querySelectorAll("[data-open-item]").forEach((row) => {
    row.addEventListener("click", () => abrirDetalheItem(row.dataset.openItem));
  });
}

async function salvarImportancia(itemId, nivel) {
  const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
  if (!item || item.owner_id !== db.getUserId()) return;
  item.importancia = nivel;
  renderList();
  if (itemModalId === itemId) renderModalBody(item);
  try {
    await db.updateImportancia(itemId, nivel);
    pendingItems = ordenarPorImportancia(pendingItems);
  } catch (err) {
    console.error("Erro ao salvar importância:", err);
  }
}

// ---------- Modal de detalhe do item ----------

function categoriasConhecidas() {
  const todas = [...pendingItems, ...doneItems]
    .map((i) => i.categoria)
    .filter(Boolean);
  return [...new Set(todas)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function abrirDetalheItem(itemId) {
  const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
  if (!item) return;

  itemModalId = itemId;
  renderModalBody(item);
  el.modalBackdrop.style.display = "flex";
}

function fecharModal() {
  el.modalBackdrop.style.display = "none";
  itemModalId = null;
}

el.modalClose.addEventListener("click", fecharModal);
el.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === el.modalBackdrop) fecharModal();
});

function renderModalBody(item) {
  const done = item.status === "feito";
  const isMine = item.owner_id === db.getUserId();
  const cor = item.categoria ? corCategoria(item.categoria) : null;
  const categoriaStyle = cor ? `background:${cor.bg};border-color:${cor.border};color:${cor.text};` : "";
  const nivelAtual = item.importancia || "normal";

  const nomesCompartilhados = (item.compartilhado_com || [])
    .map((id) => profilesById[id]?.nome)
    .filter(Boolean);

  el.modalBody.innerHTML = `
    <div class="modal-title">${escapeHtml(item.texto_original)}</div>
    <div class="modal-meta">
      Criado em ${formatDate(item.criado_em)}
      ${done ? `· Concluído em ${formatDate(item.concluido_em)}` : ""}
      ${!isMine ? `· compartilhado por ${escapeHtml(profilesById[item.owner_id]?.nome || "alguém")}` : ""}
    </div>

    <div class="modal-section">
      <div class="modal-label">Categoria</div>
      ${isMine ? `
        <button class="category-edit-btn" id="modalCategoryBtn" style="${categoriaStyle}">
          ${item.categoria ? escapeHtml(item.categoria) : "+ categoria"}
        </button>
        <div class="category-popover" id="modalCategoryPopover" style="display:none;"></div>
      ` : `<span class="pill" style="${categoriaStyle}">${item.categoria ? escapeHtml(item.categoria) : "Sem categoria"}</span>`}
    </div>

    <div class="modal-section">
      <div class="modal-label">Importância</div>
      <div class="dots-row">${dotsHtml(item.id, nivelAtual, "lg", isMine)}</div>
    </div>

    ${isMine && otherProfiles.length > 0 ? `
      <div class="modal-section">
        <div class="modal-label">Compartilhado com</div>
        <div class="share-row" id="modalShareRow">
          ${otherProfiles.map((p) => {
            const active = (item.compartilhado_com || []).includes(p.id);
            return `<button class="chip ${active ? "chip-active" : ""}" data-modal-share="${p.id}">${escapeHtml(p.nome)}</button>`;
          }).join("")}
        </div>
      </div>
    ` : ""}

    ${isMine ? `
      <div class="modal-section">
        <button class="category-save-btn" id="modalEditBtn">Editar</button>
      </div>
      <div class="edit-form" id="modalEditForm" style="display:none;"></div>
    ` : ""}
  `;

  if (!isMine) return;

  document.getElementById("modalCategoryBtn").addEventListener("click", () => {
    toggleModalCategoryPopover(item);
  });

  el.modalBody.querySelectorAll("[data-set-priority]").forEach((btn) => {
    btn.addEventListener("click", () => salvarImportancia(item.id, btn.dataset.nivel));
  });

  const shareRow = document.getElementById("modalShareRow");
  if (shareRow) {
    shareRow.querySelectorAll("[data-modal-share]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const personId = btn.dataset.modalShare;
        const atual = item.compartilhado_com || [];
        const novo = atual.includes(personId)
          ? atual.filter((id) => id !== personId)
          : [...atual, personId];

        btn.classList.toggle("chip-active");
        try {
          await db.updateSharing(item.id, novo);
          item.compartilhado_com = novo;
        } catch (err) {
          console.error("Erro ao compartilhar:", err);
          btn.classList.toggle("chip-active");
        }
      });
    });
  }

  document.getElementById("modalEditBtn").addEventListener("click", () => {
    abrirEdicaoNoModal(item);
  });
}

function toggleModalCategoryPopover(item) {
  const popover = document.getElementById("modalCategoryPopover");
  if (!popover) return;

  if (popover.style.display === "flex") {
    popover.style.display = "none";
    return;
  }

  const conhecidas = categoriasConhecidas();
  popover.style.display = "flex";
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

  popover.querySelectorAll("[data-set-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await salvarCategoria(item.id, btn.dataset.setCategory);
      popover.style.display = "none";
      renderModalBody(item);
    });
  });

  const input = popover.querySelector(".category-new-input");
  const salvar = async () => {
    const valor = input.value.trim();
    await salvarCategoria(item.id, valor || null);
    popover.style.display = "none";
    renderModalBody(item);
  };
  popover.querySelector(".category-save-btn").addEventListener("click", salvar);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); salvar(); }
  });
}

async function salvarCategoria(itemId, categoria) {
  const item = pendingItems.find((i) => i.id === itemId) || doneItems.find((i) => i.id === itemId);
  if (item) item.categoria = categoria;
  try {
    await db.updateCategoria(itemId, categoria);
    renderList();
    renderHomeCards();
  } catch (err) {
    console.error("Erro ao salvar categoria:", err);
  }
}

function abrirEdicaoNoModal(item) {
  const container = document.getElementById("modalEditForm");
  if (!container) return;

  if (container.style.display === "block") {
    container.style.display = "none";
    return;
  }

  const dataValue = item.data_sugerida ? new Date(item.data_sugerida).toISOString().slice(0, 10) : "";

  container.style.display = "block";
  container.innerHTML = `
    <textarea class="category-new-input" rows="3" style="width:100%;">${escapeHtml(item.texto_original)}</textarea>
    <input type="date" class="category-new-input" style="margin-top:8px;" value="${dataValue}">
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="category-save-btn" id="modalSaveEdit">Salvar</button>
      <button class="category-edit-btn" id="modalCancelEdit">Cancelar</button>
    </div>
  `;

  document.getElementById("modalSaveEdit").addEventListener("click", async () => {
    const novoTexto = container.querySelector("textarea").value.trim();
    const novaData = container.querySelector("input[type=date]").value;
    if (!novoTexto) return;

    try {
      await db.updateItemContent(item.id, {
        texto_original: novoTexto,
        data_sugerida: novaData || null,
      });
      fecharModal();
      await refreshData();
    } catch (err) {
      console.error("Erro ao salvar edição do item:", err);
    }
  });

  document.getElementById("modalCancelEdit").addEventListener("click", () => {
    container.style.display = "none";
  });
}

// ---------- Ordenação ----------

function ordenarPorImportancia(items) {
  return [...items].sort((a, b) => {
    const pa = IMPORTANCIA_PESO[a.importancia || "normal"];
    const pb = IMPORTANCIA_PESO[b.importancia || "normal"];
    return pb - pa;
  });
}

// ---------- Sincronização de dados ----------

async function refreshData() {
  const [pending, done, compartilhados] = await Promise.all([
    db.listPending(),
    db.listDone(),
    db.listSharedWithMe(),
  ]);

  const ownerIds = [...new Set(compartilhados.map((i) => i.owner_id))];
  if (ownerIds.length > 0) {
    const owners = await db.getProfilesByIds(ownerIds);
    owners.forEach((p) => (profilesById[p.id] = p));
  }

  const compPendentes = compartilhados.filter((i) => i.status === "pendente");
  const compFeitos = compartilhados.filter((i) => i.status === "feito");

  pendingItems = ordenarPorImportancia([...pending, ...compPendentes]);
  doneItems = [...done, ...compFeitos];

  renderHomeCards();
  renderList();
  notifications.updateBadge(pending.length);
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

  try {
    const meuPerfil = await db.getMyProfile();
    meuNome = meuPerfil?.nome || "";
  } catch (err) {
    console.error("Erro ao buscar perfil:", err);
  }

  postagens.init();
  calendario.init();

  await refreshData();
  db.onChange(() => refreshData());

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
    el.homeCategoryCards.innerHTML = `
      <div class="empty-state">
        <strong>Não consegui conectar.</strong>
        Confira se a URL e a chave do Supabase estão certas em js/config.js.
      </div>
    `;
  });
});