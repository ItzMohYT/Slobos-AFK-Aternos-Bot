let bot = null;

function createBotInstance() {
  if (!config || !config.server) return;

  const botOptions = {
    host: config.server.ip,
    port: Number(config.server.port) || 25565,
    username: config["bot-account"]?.username || "Slobot00",
    auth: config["bot-account"]?.type === "microsoft" ? "microsoft" : "offline",
    version: config.server.version ? String(config.server.version) : false,
    physicsEnabled: false, // يمنع إرسال حزم حركة فيزيائية قد ترفض في 1.21.11
  };

  bot = mineflayer.createBot(botOptions);

  // تحميل pathfinder فقط عند الحاجة؛ إبقاء الحركة معطلة إذا كان config.movement.enabled غير مفعّل
  if (config.movement && config.movement.enabled) {
    bot.loadPlugin(pathfinder);
  }

  bot.once("spawn", () => {
    bot.physicsEnabled = false;
    botState.connected = true;
    botState.reconnectAttempts = 0;
    botState.lastActivity = Date.now();
    addLog("[Bot] Spawned and physics disabled to prevent invalid movement packets.");

    if (config.movement && config.movement.enabled) {
      const movements = new Movements(bot);
      bot.pathfinder.setMovements(movements);
    }
  });

  bot.on("kicked", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Kicked: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`);
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    addLog(`[Bot] Disconnected: ${reason || "socketClosed"}`);
  });

  bot.on("error", (err) => {
    addLog(`[Bot] Error: ${err.message}`);
  });
}
