// ============================================================
// Camada de dados — tudo que fala com o Supabase passa por aqui
// ============================================================

const db = (() => {
  let client = null;
  let currentUserId = null;

  async function init() {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: { session } } = await client.auth.getSession();

    if (session) {
      currentUserId = session.user.id;
    } else {
      // Sessão anônima: identifica o dispositivo/usuário sem exigir
      // cadastro. Quando o compartilhamento (Camada 3) entrar, isso
      // vira login de verdade para Tiffany, Amanda e Marcelo.
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      currentUserId = data.user.id;
    }

    return currentUserId;
  }

  async function createItem(texto) {
    const { data, error } = await client
      .from("items")
      .insert({ texto_original: texto, owner_id: currentUserId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function listPending() {
    const { data, error } = await client
      .from("items")
      .select("*")
      .eq("status", "pendente")
      .order("prioridade_calculada", { ascending: false })
      .order("criado_em", { ascending: true });
    if (error) throw error;
    return data;
  }

  async function listDone(limit = 30) {
    const { data, error } = await client
      .from("items")
      .select("*")
      .eq("status", "feito")
      .order("concluido_em", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async function markDone(id) {
    const { error } = await client
      .from("items")
      .update({ status: "feito", concluido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async function markUndone(id) {
    const { error } = await client
      .from("items")
      .update({ status: "pendente", concluido_em: null })
      .eq("id", id);
    if (error) throw error;
  }

  async function postpone(id, vezesAdiadoAtual) {
    // Adiar não esconde o item — ele volta pro fim da fila, mas o
    // contador de "adiado" sobe, o que a IA vai usar depois pra
    // priorizar itens que você está sistematicamente evitando.
    const { error } = await client
      .from("items")
      .update({ vezes_adiado: (vezesAdiadoAtual || 0) + 1 })
      .eq("id", id);
    if (error) throw error;
  }

  function onChange(callback) {
    return client
      .channel("items-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        callback
      )
      .subscribe();
  }

  return {
    init,
    createItem,
    listPending,
    listDone,
    markDone,
    markUndone,
    postpone,
    onChange,
    getUserId: () => currentUserId,
  };
})();
