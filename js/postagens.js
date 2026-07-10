// ============================================================
// Registro de Postagens — compartilhado entre todos, planejamento
// + publicação + métricas manuais
// ============================================================

const PLATAFORMAS = ["Instagram", "TikTok", "Facebook", "WhatsApp", "Blog", "Outro"];

const postagens = (() => {
  let lista = [];
  let filtroProjeto = "todos";

  const elP = {
    text: document.getElementById("postText"),
    projectInput: document.getElementById("postProjectInput"),
    projectRow: document.getElementById("postProjectRow"),
    submit: document.getElementById("postSubmit"),
    filterRow: document.getElementById("postFilterRow"),
    planejados: document.getElementById("postsPlanejados"),
    publicados: document.getElementById("postsPublicados"),
  };

  function projetosConhecidos() {
    return [...new Set(lista.map((p) => p.projeto))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function renderFormProjectRow() {
    const projetos = projetosConhecidos();

    if (projetos.length === 0) {
      elP.projectRow.innerHTML = "";
      return;
    }

    elP.projectRow.innerHTML = projetos.map((p) => {
      const cor = corCategoria(p);
      const ativo = elP.projectInput.value.trim() === p;
      const style = ativo
        ? `background:${cor.bg};border-color:${cor.border};color:${cor.text};`
        : "";
      return `<button type="button" class="chip proj-chip ${ativo ? "chip-active" : ""}" data-proj="${escapeHtml(p)}" style="${style}">${escapeHtml(p)}</button>`;
    }).join("");

    elP.projectRow.querySelectorAll("[data-proj]").forEach((btn) => {
      btn.addEventListener("click", () => {
        elP.projectInput.value = btn.dataset.proj;
        renderFormProjectRow();
        atualizarBotaoSubmit();
      });
    });
  }

  function atualizarBotaoSubmit() {
    const temTexto = elP.text.value.trim().length > 0;
    const temProjeto = elP.projectInput.value.trim().length > 0;
    elP.submit.disabled = !(temTexto && temProjeto);
  }

  elP.text.addEventListener("input", atualizarBotaoSubmit);
  elP.projectInput.addEventListener("input", () => {
    renderFormProjectRow();
    atualizarBotaoSubmit();
  });

  elP.submit.addEventListener("click", async () => {
    const texto = elP.text.value.trim();
    const projeto = elP.projectInput.value.trim();
    if (!texto || !projeto) return;

    elP.submit.disabled = true;
    try {
      await db.createPostagem(texto, projeto);
      elP.text.value = "";
      elP.projectInput.value = "";
      await refresh();
    } catch (err) {
      console.error("Erro ao criar postagem:", err);
    } finally {
      atualizarBotaoSubmit();
    }
  });

  function renderFilterRow() {
    const projetos = projetosConhecidos();
    const opcoes = ["todos", ...projetos];
    elP.filterRow.innerHTML = opcoes.map((p) => {
      const label = p === "todos" ? "Todos" : p;
      const ativo = filtroProjeto === p;
      let style = "";
      if (p !== "todos") {
        const cor = corCategoria(p);
        style = ativo ? `background:${cor.bg};border-color:${cor.border};color:${cor.text};` : "";
      } else if (ativo) {
        style = `background:var(--purple-soft);border-color:var(--purple);color:var(--purple);`;
      }
      return `<button class="chip filter-chip ${ativo ? "chip-active" : ""}" data-filter="${escapeHtml(p)}" style="${style}">${escapeHtml(label)}</button>`;
    }).join("");

    elP.filterRow.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filtroProjeto = btn.dataset.filter;
        render();
      });
    });
  }

  function itensFiltrados(items) {
    if (filtroProjeto === "todos") return items;
    return items.filter((p) => p.projeto === filtroProjeto);
  }

  function formatarData(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  function renderPlanejados() {
    const planejados = itensFiltrados(lista.filter((p) => p.status === "planejado"));

    if (planejados.length === 0) {
      elP.planejados.innerHTML = `<div class="list-section-title">Planejados</div>
        <div class="empty-state" style="margin: 20px auto;"><strong>Nada planejado ainda.</strong></div>`;
      return;
    }

    elP.planejados.innerHTML =
      `<div class="list-section-title">Planejados (${planejados.length})</div>` +
      planejados.map((p) => {
        const cor = corCategoria(p.projeto);
        return `
          <div class="item-card post-card">
            <div class="item-body">
              <div class="item-text">${escapeHtml(p.texto)}</div>
              <div class="tags-row">
                <span class="pill" style="background:${cor.bg};border-color:${cor.border};color:${cor.text};">${escapeHtml(p.projeto)}</span>
                <span class="tag">criado ${formatarData(p.criado_em)}</span>
              </div>
              <button class="category-save-btn" style="margin-top:10px;" data-publish="${p.id}">Marcar como publicado</button>
              <button class="category-edit-btn" data-edit-post="${p.id}">editar</button>
              <div class="publish-form" id="publish-form-${p.id}" style="display:none;"></div>
              <div class="edit-form" id="edit-post-${p.id}" style="display:none;"></div>
            </div>
          </div>
        `;
      }).join("");

    elP.planejados.querySelectorAll("[data-publish]").forEach((btn) => {
      btn.addEventListener("click", () => abrirFormPublicar(btn.dataset.publish));
    });

    elP.planejados.querySelectorAll("[data-edit-post]").forEach((btn) => {
      btn.addEventListener("click", () => abrirEdicaoPost(btn.dataset.editPost));
    });
  }

  function abrirFormPublicar(id) {
    const container = document.getElementById(`publish-form-${id}`);
    if (!container) return;

    if (container.style.display === "block") {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    container.innerHTML = `
      <div class="platform-row">
        ${PLATAFORMAS.map((pl) => `<button type="button" class="chip platform-chip" data-platform="${escapeHtml(pl)}">${escapeHtml(pl)}</button>`).join("")}
      </div>
      <input type="url" class="category-new-input" placeholder="link do post (opcional)" style="margin-top:8px;width:100%;">
      <button class="category-save-btn" style="margin-top:8px;" data-confirm-publish="${id}">Confirmar publicação</button>
    `;

    let plataformaEscolhida = null;
    container.querySelectorAll("[data-platform]").forEach((btn) => {
      btn.addEventListener("click", () => {
        plataformaEscolhida = btn.dataset.platform;
        container.querySelectorAll("[data-platform]").forEach((b) => b.classList.remove("chip-active"));
        btn.classList.add("chip-active");
      });
    });

    container.querySelector("[data-confirm-publish]").addEventListener("click", async () => {
      const link = container.querySelector("input").value.trim();
      try {
        await db.marcarPostagemPublicada(id, {
          link,
          plataforma: plataformaEscolhida,
          data_publicacao: new Date().toISOString(),
        });
        await refresh();
      } catch (err) {
        console.error("Erro ao marcar como publicado:", err);
      }
    });
  }

  function renderPublicados() {
    const publicados = itensFiltrados(lista.filter((p) => p.status === "publicado"));

    if (publicados.length === 0) {
      elP.publicados.innerHTML = `<div class="list-section-title">Publicados</div>
        <div class="empty-state" style="margin: 20px auto;"><strong>Nada publicado ainda.</strong></div>`;
      return;
    }

    elP.publicados.innerHTML =
      `<div class="list-section-title">Publicados (${publicados.length})</div>` +
      publicados.map((p) => {
        const cor = corCategoria(p.projeto);
        return `
          <div class="item-card post-card">
            <div class="item-body">
              <div class="item-text">${escapeHtml(p.texto)}</div>
              <div class="tags-row">
                <span class="pill" style="background:${cor.bg};border-color:${cor.border};color:${cor.text};">${escapeHtml(p.projeto)}</span>
                ${p.plataforma ? `<span class="tag">${escapeHtml(p.plataforma)}</span>` : ""}
                <span class="tag">publicado ${formatarData(p.data_publicacao)}</span>
                ${p.link ? `<a href="${escapeHtml(p.link)}" target="_blank" rel="noopener" class="tag" style="text-decoration:none;">abrir ↗</a>` : ""}
              </div>
              <div class="metrics-row">
                <label>Visualizações<input type="number" min="0" data-metric="visualizacoes" data-id="${p.id}" value="${p.visualizacoes ?? ""}"></label>
                <label>Curtidas<input type="number" min="0" data-metric="curtidas" data-id="${p.id}" value="${p.curtidas ?? ""}"></label>
                <label>Comentários<input type="number" min="0" data-metric="comentarios" data-id="${p.id}" value="${p.comentarios ?? ""}"></label>
              </div>
              <button class="category-edit-btn" style="margin-top:10px;" data-edit-post="${p.id}">editar</button>
              <div class="edit-form" id="edit-post-${p.id}" style="display:none;"></div>
            </div>
          </div>
        `;
      }).join("");

    elP.publicados.querySelectorAll("[data-metric]").forEach((input) => {
      input.addEventListener("change", async () => {
        const id = input.dataset.id;
        const item = lista.find((p) => p.id === id);
        if (!item) return;

        const campo = input.dataset.metric;
        const valor = input.value === "" ? null : parseInt(input.value, 10);
        item[campo] = valor;

        try {
          await db.updatePostagemMetricas(id, {
            visualizacoes: item.visualizacoes ?? null,
            curtidas: item.curtidas ?? null,
            comentarios: item.comentarios ?? null,
          });
        } catch (err) {
          console.error("Erro ao salvar métrica:", err);
        }
      });
    });

    elP.publicados.querySelectorAll("[data-edit-post]").forEach((btn) => {
      btn.addEventListener("click", () => abrirEdicaoPost(btn.dataset.editPost));
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function render() {
    renderFormProjectRow();
    renderFilterRow();
    renderPlanejados();
    renderPublicados();
  }

  function abrirEdicaoPost(id) {
    const container = document.getElementById(`edit-post-${id}`);
    if (!container) return;

    if (container.style.display === "block") {
      container.style.display = "none";
      return;
    }

    const post = lista.find((p) => p.id === id);
    if (!post) return;

    const ehPublicado = post.status === "publicado";

    container.style.display = "block";
    container.innerHTML = `
      <textarea class="category-new-input" rows="2" style="width:100%;">${escapeHtml(post.texto)}</textarea>
      <input type="text" class="category-new-input" style="margin-top:8px;width:100%;" placeholder="projeto" value="${escapeHtml(post.projeto)}">
      ${ehPublicado ? `
        <div class="platform-row">
          ${PLATAFORMAS.map((pl) => `<button type="button" class="chip platform-chip ${post.plataforma === pl ? "chip-active" : ""}" data-edit-platform="${escapeHtml(pl)}">${escapeHtml(pl)}</button>`).join("")}
        </div>
        <input type="url" class="category-new-input" style="margin-top:8px;width:100%;" placeholder="link" value="${post.link ? escapeHtml(post.link) : ""}">
      ` : ""}
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="category-save-btn" data-save-post="${id}">Salvar</button>
        <button class="category-edit-btn" data-cancel-post="${id}">Cancelar</button>
      </div>
    `;

    let plataformaEscolhida = post.plataforma || null;
    container.querySelectorAll("[data-edit-platform]").forEach((btn) => {
      btn.addEventListener("click", () => {
        plataformaEscolhida = btn.dataset.editPlatform;
        container.querySelectorAll("[data-edit-platform]").forEach((b) => b.classList.remove("chip-active"));
        btn.classList.add("chip-active");
      });
    });

    container.querySelector("[data-save-post]").addEventListener("click", async () => {
      const novoTexto = container.querySelector("textarea").value.trim();
      const inputs = container.querySelectorAll("input");
      const novoProjeto = inputs[0].value.trim();
      if (!novoTexto || !novoProjeto) return;

      const campos = { texto: novoTexto, projeto: novoProjeto };
      if (ehPublicado) {
        campos.plataforma = plataformaEscolhida;
        campos.link = inputs[1] ? inputs[1].value.trim() : post.link;
      }

      try {
        await db.updatePostagemConteudo(id, campos);
        container.style.display = "none";
        await refresh();
      } catch (err) {
        console.error("Erro ao salvar edição da postagem:", err);
      }
    });

    container.querySelector("[data-cancel-post]").addEventListener("click", () => {
      container.style.display = "none";
    });
  }

  async function refresh() {
    lista = await db.listPostagens();
    render();
  }

  function init() {
    db.onPostagensChange(() => refresh());
  }

  return { init, refresh };
})();