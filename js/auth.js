// ============================================================
// Tela de autenticação — login, cadastro, e conversão de sessão
// anônima em conta de verdade (caso já exista uso prévio no app)
// ============================================================

const auth = (() => {
  let mode = "login"; // "login" | "signup"

  const elAuth = {
    screen: document.getElementById("authScreen"),
    tabLogin: document.getElementById("authTabLogin"),
    tabSignup: document.getElementById("authTabSignup"),
    form: document.getElementById("authForm"),
    fieldNome: document.getElementById("fieldNome"),
    nome: document.getElementById("authNome"),
    email: document.getElementById("authEmail"),
    password: document.getElementById("authPassword"),
    submit: document.getElementById("authSubmit"),
    error: document.getElementById("authError"),
  };

  function setMode(newMode) {
    mode = newMode;
    elAuth.tabLogin.classList.toggle("active", mode === "login");
    elAuth.tabSignup.classList.toggle("active", mode === "signup");
    elAuth.fieldNome.style.display = mode === "signup" ? "block" : "none";
    elAuth.nome.required = mode === "signup";
    elAuth.submit.textContent = mode === "signup" ? "Criar conta" : "Entrar";
    elAuth.error.textContent = "";
  }

  function showScreen() {
    elAuth.screen.style.display = "flex";
    document.getElementById("app").style.display = "none";
  }

  function hideScreen() {
    elAuth.screen.style.display = "none";
    document.getElementById("app").style.display = "flex";
  }

  async function handleSubmit(e, onAuthenticated) {
    e.preventDefault();
    elAuth.error.textContent = "";
    elAuth.submit.disabled = true;

    const email = elAuth.email.value.trim();
    const password = elAuth.password.value;
    const nome = elAuth.nome.value.trim();

    try {
      if (mode === "signup") {
        if (!nome) throw new Error("Escreve seu nome também.");
        await db.signUp(email, password, nome);
      } else {
        await db.signIn(email, password);
      }
      hideScreen();
      onAuthenticated();
    } catch (err) {
      elAuth.error.textContent = traduzErro(err.message);
    } finally {
      elAuth.submit.disabled = false;
    }
  }

  function traduzErro(msg) {
    if (!msg) return "Algo deu errado. Tenta de novo.";
    if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
    if (msg.includes("already registered")) return "Esse e-mail já tem conta — tenta entrar em vez de criar.";
    if (msg.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
    return msg;
  }

  async function init(onAuthenticated) {
    const session = await db.getSession();

    // Sessão real (não anônima) já existe: entra direto, sem mostrar login.
    if (session && !db.isAnonymousSession(session)) {
      hideScreen();
      onAuthenticated();
      return;
    }

    // Sem sessão, ou sessão anônima (uso anterior sem conta): mostra
    // a tela de login, com o cadastro pronto pra converter a sessão
    // anônima em conta de verdade, se for o caso.
    showScreen();

    elAuth.tabLogin.addEventListener("click", () => setMode("login"));
    elAuth.tabSignup.addEventListener("click", () => setMode("signup"));
    elAuth.form.addEventListener("submit", (e) => handleSubmit(e, onAuthenticated));

    setMode(session && db.isAnonymousSession(session) ? "signup" : "login");
  }

  return { init };
})();