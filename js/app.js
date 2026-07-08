// ============================================================
// App principal
// ============================================================

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
    pendingItems.push(pendingItems.shift());
    renderNext();
  });
}

// ---------- Renderização: lista completa ----------

function renderList() {
  el.pendingList.innerHTML =
    `<div class="list-section-title">Pendentes (${pendingItems.length})</div>` +
    pendingItems.map((item) => renderItemCard(item, { withShare: true })).join("");

  el.doneList.innerHTML = doneItems.length
    ? `<div class="list-section-title">Concluídos</div>` +
      doneItems.map((item) => renderItemCard(item, { withShare: false })).join("")
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
  const done = item.status === "feito";
  const checkAttr = done ? `data-uncheck="${item.id}"` : `data-check="${item.id}"`;
  const meta = done
    ? `Criado ${formatDate(item.criado_em)} · Concluído ${formatDate(item.concluido_em)}`
    : `Criado ${formatDate(item.criado_em)}`;

  const tags = [];
  if (item.categoria) tags.push(`<span class="tag">${escapeHtml(item.categoria)}</span>`);
  if (item.tipo) tags.push(`<span class="tag">${item.tipo}</span>`);
  if (item.data_sugerida) tags.push(`<span class="tag">prazo: ${formatDate(item.data_sugerida)}</span>`);
  if (item.notas_ia) tags.push(`<span class="tag">${escapeHtml(item.notas_ia)}</span>`);

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
        ${shareChips}
      </div>
    </div>
  `;
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
        btn.classList.toggle("chip-active"); // desfaz visualmente se falhar
      }
    });
  });
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