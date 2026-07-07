// ============================================================
// Badge no ícone + notificações
//
// O badge funciona assim que o app é instalado, sem pedir nada.
// Notificação real em segundo plano (com o app fechado) exige um
// servidor enviando push — isso é o próximo passo, depois que essa
// Camada 1 estiver rodando e você confirmar que o hábito pegou.
// Por enquanto, notificação local dispara enquanto o app está aberto
// em background (aba minimizada), o que já cobre boa parte do dia.
// ============================================================

const notifications = (() => {
  function updateBadge(count) {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  async function requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission();
  }

  function showLocal(texto) {
    if (Notification.permission !== "granted") return;
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification("Fluxo", {
        body: texto,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "fluxo-proximo-item",
        renotify: true,
      });
    });
  }

  // Dispara um lembrete local a cada N minutos enquanto o app está
  // aberto (mesmo em segunda aba/minimizado no Android). Guarda o
  // texto do item mais antigo pendente, não uma mensagem genérica.
  let intervalId = null;
  function startLocalReminders(getNextItemText, intervalMinutes = 150) {
    stopLocalReminders();
    intervalId = setInterval(() => {
      const texto = getNextItemText();
      if (texto) showLocal(texto);
    }, intervalMinutes * 60 * 1000);
  }

  function stopLocalReminders() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  return { updateBadge, requestPermission, showLocal, startLocalReminders, stopLocalReminders };
})();
