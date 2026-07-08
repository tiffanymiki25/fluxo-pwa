// ============================================================
// Camada de dados — tudo que fala com o Supabase passa por aqui
// ============================================================

const db = (() => {
  let client = null;
  let currentUserId = null;

  function initClient() {
    if (!client) {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
        },
      });
    }
    return client;
  }

  async function getSession() {
    initClient();
    const { data: { session } } = await client.auth.getSession();
    if (session) currentUserId = session.user.id;
    return session;
  }

  function isAnonymousSession(session) {
    return !!session && session.user.is_anonymous === true;
  }

  async function signUp(email, password, nome) {
    initClient();
    const { data: { session } } = await client.auth.getSession();

    let userId;

    if (isAnonymousSession(session)) {
      // Já existe uma sessão anônima neste navegador (caso da Tiffany,
      // que já capturou itens antes do login existir). Converter em
      // vez de criar do zero preserva o mesmo id — os itens continuam dela.
      const { data, error } = await client.auth.updateUser({ email, password });
      if (error) throw error;
      userId = data.user.id;
    } else {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      userId = data.user.id;
    }

    currentUserId = userId;

    const { error: profileError } = await client
      .from("profiles")
      .upsert({ id: userId, nome });
    if (profileError) throw profileError;

    return userId;
  }

  async function signIn(email, password) {
    initClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUserId = data.user.id;
    return data.user.id;
  }

  async function signOut() {
    await client.auth.signOut();
    currentUserId = null;
  }

  async function getMyProfile() {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", currentUserId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function listOtherProfiles() {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .neq("id", currentUserId);
    if (error) throw error;
    return data;
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
      .eq("owner_id", currentUserId)
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
      .eq("owner_id", currentUserId)
      .order("concluido_em", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async function listSharedWithMe() {
    const { data, error } = await client
      .from("items")
      .select("*")
      .contains("compartilhado_com", [currentUserId])
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function getProfilesByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .in("id", ids);
    if (error) throw error;
    return data;
  }

  async function updateSharing(itemId, sharedWithIds) {
    const { error } = await client
      .from("items")
      .update({ compartilhado_com: sharedWithIds })
      .eq("id", itemId);
    if (error) throw error;
  }

  async function updateCategoria(itemId, categoria) {
    const { error } = await client
      .from("items")
      .update({ categoria })
      .eq("id", itemId);
    if (error) throw error;
  }

  async function updateImportancia(itemId, importancia) {
    const { error } = await client
      .from("items")
      .update({ importancia })
      .eq("id", itemId);
    if (error) throw error;
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

  async function classifyItem(itemId) {
    // Fire-and-forget do ponto de vista da UI: não bloqueia a captura.
    // A classificação chega via realtime quando terminar.
    try {
      await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId }),
      });
    } catch (err) {
      console.error("Falha ao pedir classificação:", err);
    }
  }

  async function savePushSubscription(subscription) {
    const { error } = await client
      .from("push_subscriptions")
      .upsert({ owner_id: currentUserId, subscription });
    if (error) throw error;
  }

  async function createPostagem(texto, projeto) {
    const { data, error } = await client
      .from("postagens")
      .insert({ texto, projeto, owner_id: currentUserId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function listPostagens() {
    const { data, error } = await client
      .from("postagens")
      .select("*")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function marcarPostagemPublicada(id, { link, plataforma, data_publicacao }) {
    const { error } = await client
      .from("postagens")
      .update({
        status: "publicado",
        link: link || null,
        plataforma: plataforma || null,
        data_publicacao: data_publicacao || new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }

  async function updatePostagemMetricas(id, { visualizacoes, curtidas, comentarios }) {
    const { error } = await client
      .from("postagens")
      .update({
        visualizacoes,
        curtidas,
        comentarios,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }

  function onPostagensChange(callback) {
    return client
      .channel("postagens-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "postagens" },
        callback
      )
      .subscribe();
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
    getSession,
    isAnonymousSession,
    signUp,
    signIn,
    signOut,
    getMyProfile,
    listOtherProfiles,
    getProfilesByIds,
    createItem,
    listPending,
    listDone,
    listSharedWithMe,
    updateSharing,
    updateCategoria,
    updateImportancia,
    markDone,
    markUndone,
    postpone,
    classifyItem,
    savePushSubscription,
    createPostagem,
    listPostagens,
    marcarPostagemPublicada,
    updatePostagemMetricas,
    onPostagensChange,
    onChange,
    getUserId: () => currentUserId,
  };
})();