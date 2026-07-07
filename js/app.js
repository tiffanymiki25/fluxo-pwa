// ============================================================
// App principal
// ============================================================

let pendingItems = [];
let doneItems = [];

const el = {
  input: document.getElementById("captureInput"),
  send: document.getElementById("captureSend"),
  nextContent: document.getElementById("nextContent"),
  nextStage: document.getElementById("nextStage"),
  listView: document.getElementById("listView"),
  pendingList: document.getElementById("pendingList"),
  doneList: document.getElementById("doneList"),
  navNext: document.getElementById("navNext"),
  navList: document.getElementById("navList"),
  tabNext: document.getElementById("tabNext"),
  tabList: document.getElementById("tabList"),
};

// ---------- Formatação ----------

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ---------- Navegação entre telas ----------

function showView(view) {
  const isNext = view === "next";
  el.nextStage.classList.toggle("hidden", !isNext);
  el.listView.classList.toggle("active", !isNext);
  el.navNext.classList.toggle("active", isNext);
  el.navList.classList.toggle("active", !isNext);
  el.tabNext.classList.toggle("active", isNext);
  el.tabList.classList.toggle("active", !isNext);
}

el.navNext.addEventListener("click", () => showView("next"));
el.navList.addEventListener("click", () => showView("list"));
el.tabNext.addEventListener("click", () => showView("next"));
el.tabList.addEventListener("click", () => showView("list"));

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
    await db.createItem(texto);
    await refreshData();

    // Primeira captura bem-sucedida é um bom momento pra pedir
    // permissão de notificação — já demonstrou valor antes de pedir algo.
    if (Notification.permission === "default") {
      notifications.requestPermission();
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

  el.nextContent.innerHTML = `
    <div class="next-eyebrow">Próximo</div>
    <div class="next-card">
      <div class="next-card-text">${escapeHtml(item.texto_original)}</div>
      <div class="next-card-meta">Criado em ${formatDate(item.criado_em)}</div>
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
    // Move pro fim da fila local imediatamente, sem esperar round-trip
    pendingItems.push(pendingItems.shift());
    renderNext();
  });
}

// ---------- Renderização: lista completa ----------

function renderList() {
  el.pendingList.innerHTML =
    `<div class="list-section-title">Pendentes (${pendingItems.length})</div>` +
    pendingItems.map(renderItemCard).join("");

  el.doneList.innerHTML = doneItems.length
    ? `<div class="list-section-title">Concluídos</div>` +
      doneItems.map(renderItemCard).join("")
    : "";

  el.pendingList.querySelectorAll("[data-check]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.check;
      await db.markDone(id);
      await refreshData();
    });
  });

  el.doneList.querySelectorAll("[data-uncheck]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.uncheck;
      await db.markUndone(id);
      await refreshData();
    });
  });
}

function renderItemCard(item) {
  const done = item.status === "feito";
  const checkAttr = done ? `data-uncheck="${item.id}"` : `data-check="${item.id}"`;
  const meta = done
    ? `Criado ${formatDate(item.criado_em)} · Concluído ${formatDate(item.concluido_em)}`
    : `Criado ${formatDate(item.criado_em)}`;

  const tags = [];
  if (item.categoria) tags.push(`<span class="tag">${escapeHtml(item.categoria)}</span>`);
  if (item.tipo) tags.push(`<span class="tag">${item.tipo}</span>`);

  return `
    <div class="item-card">
      <button class="item-check ${done ? "checked" : ""}" ${checkAttr} aria-label="Marcar"></button>
      <div class="item-body">
        <div class="item-text ${done ? "done" : ""}">${escapeHtml(item.texto_original)}</div>
        <div class="item-meta">
          <span>${meta}</span>
          ${tags.join("")}
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Sincronização de dados ----------

async function refreshData() {
  [pendingItems, doneItems] = await Promise.all([db.listPending(), db.listDone()]);
  renderNext();
  renderList();
  notifications.updateBadge(pendingItems.length);
}

// ---------- Boot ----------

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.error("Falha ao registrar service worker:", err)
    );
  }

  await db.init();
  await refreshData();

  db.onChange(() => refreshData());

  notifications.startLocalReminders(() => {
    return pendingItems[0] ? pendingItems[0].texto_original : null;
  });
}

boot().catch((err) => {
  console.error("Erro ao iniciar o app:", err);
  el.nextContent.innerHTML = `
    <div class="empty-state">
      <strong>Não consegui conectar.</strong>
      Confira se a URL e a chave do Supabase estão certas em js/config.js.
    </div>
  `;
});
