// ============================================================
// Agenda — compromissos com horário marcado + itens com prazo
// (vindos da IA ou definidos manualmente no resto do app)
// ============================================================

const calendario = (() => {
  let compromissos = [];
  let itensComPrazo = [];

  const elC = {
    texto: document.getElementById("compText"),
    data: document.getElementById("compData"),
    hora: document.getElementById("compHora"),
    local: document.getElementById("compLocal"),
    submit: document.getElementById("compSubmit"),
    proximos: document.getElementById("compProximos"),
    passados: document.getElementById("compPassados"),
  };

  function atualizarBotaoSubmit() {
    elC.submit.disabled = !(elC.texto.value.trim() && elC.data.value && elC.hora.value);
  }

  [elC.texto, elC.data, elC.hora].forEach((input) =>
    input.addEventListener("input", atualizarBotaoSubmit)
  );

  elC.submit.addEventListener("click", async () => {
    const texto = elC.texto.value.trim();
    if (!texto || !elC.data.value || !elC.hora.value) return;

    const [ano, mes, dia] = elC.data.value.split("-").map(Number);
    const [h, m] = elC.hora.value.split(":").map(Number);
    const dataHora = new Date(ano, mes - 1, dia, h, m).toISOString();

    elC.submit.disabled = true;
    try {
      await db.createCompromisso(texto, dataHora, elC.local.value.trim());
      elC.texto.value = "";
      elC.data.value = "";
      elC.hora.value = "";
      elC.local.value = "";
      await refresh();
    } catch (err) {
      console.error("Erro ao criar compromisso:", err);
    } finally {
      atualizarBotaoSubmit();
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatarDataHora(iso, comHora) {
    const d = new Date(iso);
    const dataStr = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
    if (!comHora) return dataStr;
    const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dataStr} · ${horaStr}`;
  }

  function itemUnificado(fonte, tipo) {
    return fonte.map((x) => ({
      id: x.id,
      texto: x.texto || x.texto_original,
      data: tipo === "compromisso" ? x.data_hora : x.data_sugerida,
      tipo,
      local: x.local || null,
      categoria: x.categoria || null,
    }));
  }

  function diasRestantes(iso) {
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const alvo = new Date(iso);
    const alvoDia = new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate());
    const diff = Math.round((alvoDia - hoje) / 86400000);

    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff > 1) return `Faltam ${diff} dias`;
    return null; // passado — não mostra contagem
  }

  function renderCard(entry) {
    const agora = new Date();
    const dataEntry = new Date(entry.data);
    const passado = dataEntry < agora;

    const tags = [];
    const contagem = !passado ? diasRestantes(entry.data) : null;
    if (contagem) {
      tags.push(`<span class="pill" style="background:var(--info-bg);border-color:var(--info-border);color:var(--info);">${contagem}</span>`);
    }
    if (entry.tipo === "compromisso") {
      tags.push(`<span class="pill" style="background:var(--purple-soft);border-color:#DDD6FE;color:var(--purple);">Compromisso</span>`);
      if (entry.local) tags.push(`<span class="tag">📍 ${escapeHtml(entry.local)}</span>`);
    } else if (entry.categoria) {
      const cor = corCategoria(entry.categoria);
      tags.push(`<span class="pill" style="background:${cor.bg};border-color:${cor.border};color:${cor.text};">${escapeHtml(entry.categoria)}</span>`);
    }

    const acao = entry.tipo === "compromisso"
      ? `<button class="category-edit-btn" data-del-comp="${entry.id}">excluir</button>`
      : `<button class="category-edit-btn" data-done-item="${entry.id}">marcar feito</button>`;

    return `
      <div class="item-card">
        <div class="item-body">
          <div class="item-text ${passado ? "done" : ""}">${escapeHtml(entry.texto)}</div>
          <div class="tags-row">
            <span class="tag">${formatarDataHora(entry.data, entry.tipo === "compromisso")}</span>
            ${tags.join("")}
            ${acao}
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const agora = new Date();
    const unificado = [
      ...itemUnificado(compromissos, "compromisso"),
      ...itemUnificado(itensComPrazo, "item"),
    ];

    const proximos = unificado
      .filter((e) => new Date(e.data) >= agora)
      .sort((a, b) => new Date(a.data) - new Date(b.data));

    const passados = unificado
      .filter((e) => new Date(e.data) < agora)
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    elC.proximos.innerHTML = `<div class="list-section-title">Próximos (${proximos.length})</div>` +
      (proximos.length
        ? proximos.map(renderCard).join("")
        : `<div class="empty-state" style="margin:20px auto;"><strong>Nada marcado ainda.</strong></div>`);

    elC.passados.innerHTML = passados.length
      ? `<div class="list-section-title">Passados</div>` + passados.map(renderCard).join("")
      : "";

    document.querySelectorAll("[data-del-comp]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await db.deleteCompromisso(btn.dataset.delComp);
          await refresh();
        } catch (err) {
          console.error("Erro ao excluir compromisso:", err);
        }
      });
    });

    document.querySelectorAll("[data-done-item]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await db.markDone(btn.dataset.doneItem);
          await refresh();
        } catch (err) {
          console.error("Erro ao marcar item como feito:", err);
        }
      });
    });
  }

  async function refresh() {
    [compromissos, itensComPrazo] = await Promise.all([
      db.listCompromissos(),
      db.listItemsComPrazo(),
    ]);
    render();
  }

  function init() {
    db.onCompromissosChange(() => refresh());
  }

  return { init, refresh };
})();