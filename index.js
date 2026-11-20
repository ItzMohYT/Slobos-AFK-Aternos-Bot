typing = false;
              scheduleRefresh();
              label.textContent = 'Auto-refreshing every 5 seconds';
            });

            scrollBottom();
            scheduleRefresh();
          })();
        </script>
      </body>
    </html>
  `);
});

// ============================================================
// BOT CONTROL & COMMAND ENDPOINTS
// ============================================================
let bot = null;
let botEnabled = true;
let reconnectTimeout = null;
let keepAliveInterval = null;

function logBoth(message) {
  console.log(message);
  try {
    addLog(message);
  } catch (_) {}
}

function clearTimers() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function scheduleReconnect() {
  if (!botEnabled) return;
  const autoReconnect = config.utils ? config.utils["auto-reconnect"] !== false : true;
  if (!autoReconnect) return;

  const baseDelay = (config.utils && config.utils["auto-reconnect-delay"]) || 2000;
  const maxDelay = (config.utils && config.utils["max-reconnect-delay"]) || 120000;
  botState.reconnectAttempts += 1;
  const delay = Math.min(baseDelay * Math.pow(1.5, botState.reconnectAttempts - 1), maxDelay);

  logBoth(`[Bot] Reconnecting in ${(delay / 1000).toFixed(2)}s (attempt #${botState.reconnectAttempts})`);
  clearTimers();
  reconnectTimeout = setTimeout(() => {
    startBotInstance();
  }, delay);
}

function startBotInstance() {
  if (!botEnabled) return;
  clearTimers();

  if (bot) {
    try {
      bot.removeAllListeners();
      bot.quit("Restarting bot instance");
    } catch (_) {}
    bot = null;
  }

  const host = config.server && config.server.ip;
  const port = Number(config.server && config.server.port) || 25565;
  const username = (config["bot-account"] && config["bot-account"].username) || "Slobot00";
  const authType = (config["bot-account"] && config["bot-account"].type) === "microsoft" ? "microsoft" : "offline";
  const version = config.server && config.server.version ? String(config.server.version) : false;

  if (!host) {
    logBoth("[Bot] Error: Server IP is missing in settings.json");
    return;
  }

  logBoth("[Bot] Creating bot instance...");
  logBoth(`[Bot] Connecting to ${host}:${port}`);

  try {
    bot = mineflayer.createBot({
      host,
      port,
      username,
      auth: authType,
      version,
      physicsEnabled: false,
    });

    if (config.movement && config.movement.enabled) {
      bot.loadPlugin(pathfinder);
    }

    bot.once("spawn", () => {
      bot.physicsEnabled = false;
      botState.connected = true;
      botState.reconnectAttempts = 0;
      botState.lastActivity = Date.now();
      logBoth(`[Bot] [+] Successfully spawned on server! (Version: ${bot.version || version || "auto"})`);

      if (config.movement && config.movement.enabled) {
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
      }
    });

    bot.on("chat", (sender, message) => {
      botState.lastActivity = Date.now();
      if (config.utils && config.utils["chat-log"]) {
        logBoth(`[Chat] <${sender}> ${message}`);
      }
    });

    bot.on("kicked", (reason) => {
      botState.connected = false;
      const reasonStr = typeof reason === "string" ? reason : JSON.stringify(reason);
      logBoth(`[Bot] Kicked: ${reasonStr}`);
      scheduleReconnect();
    });

    bot.on("end", (reason) => {
      botState.connected = false;
      logBoth(`[Bot] Disconnected: ${reason || "socketClosed"}`);
      scheduleReconnect();
    });

    bot.on("error", (err) => {
      logBoth(`[Bot] Error: ${err && err.message ? err.message : String(err)}`);
    });
  } catch (err) {
    logBoth(`[Bot] Failed to create bot: ${err && err.message ? err.message : String(err)}`);
    scheduleReconnect();
  }
}

function stopBotInstance() {
  botEnabled = false;
  clearTimers();
  botState.connected = false;
  if (bot) {
    try {
      bot.removeAllListeners();
      bot.quit("Stopped from dashboard");
    } catch (_) {}
    bot = null;
  }
  logBoth("[Control] Bot stopped.");
}

app.post("/start", (req, res) => {
  if (botState.connected) {
    return res.json({ success: false, msg: "Bot is already connected." });
  }
  botEnabled = true;
  logBoth("[Control] Start requested from dashboard.");
  startBotInstance();
  res.json({ success: true, msg: "Bot starting..." });
});

app.post("/stop", (req, res) => {
  stopBotInstance();
  res.json({ success: true, msg: "Bot stopped." });
});

app.post("/command", (req, res) => {
  const raw = (req.body && req.body.command ? String(req.body.command) : "").trim();
  if (!raw) {
    return res.json({ success: false, msg: "Empty command." });
  }

  logBoth(`[Control] > ${raw}`);

  if (raw === "/help") {
    return res.json({
      success: true,
      msg: "/help - Show commands\n/pos - Bot coordinates\n/status - Connection status\n/list - Online players\n/say <msg> - Send chat message",
    });
  }

  if (raw === "/status") {
    const uptime = Math.floor((Date.now() - botState.startTime) / 1000);
    return res.json({
      success: true,
      msg: `Status: ${botState.connected ? "connected" : "disconnected"} | Uptime: ${uptime}s`,
    });
  }

  if (raw === "/pos") {
    if (!bot || !bot.entity || !bot.entity.position) {
      return res.json({ success: false, msg: "Position unavailable (bot not spawned)." });
    }
    const p = bot.entity.position;
    return res.json({
      success: true,
      msg: `Position: X=${p.x.toFixed(1)}, Y=${p.y.toFixed(1)}, Z=${p.z.toFixed(1)}`,
    });
  }

  if (raw === "/list") {
    if (!bot || !bot.players) {
      return res.json({ success: false, msg: "Player list unavailable." });
    }
    const names = Object.keys(bot.players);
    return res.json({
      success: true,
      msg: names.length ? `Players (${names.length}): ${names.join(", ")}` : "No players found.",
    });
  }

  if (!bot || !botState.connected) {
    return res.json({ success: false, msg: "Bot is not connected to the server." });
  }

  try {
    if (raw.startsWith("/say ")) {
      bot.chat(raw.slice(5));
    } else {
      bot.chat(raw);
    }
    return res.json({ success: true, msg: "Sent to server." });
  } catch (err) {
    return res.json({ success: false, msg: `Failed: ${err.message}` });
  }
});

// ============================================================
// GLOBAL ERROR HANDLERS & SERVER STARTUP
// ============================================================
process.on("uncaughtException", (err) => {
  logBoth(`[Fatal] Uncaught Exception: ${err && err.stack ? err.stack : err}`);
});

process.on("unhandledRejection", (reason) => {
  logBoth(`[Fatal] Unhandled Rejection: ${reason}`);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  logBoth(`[Web] Dashboard server running on http://0.0.0.0:${PORT}`);
  startBotInstance();
});

// Self-ping every 10 minutes to keep free hosting awake
keepAliveInterval = setInterval(() => {
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (!selfUrl) return;
  const client = selfUrl.startsWith("https") ? https : http;
  client.get(`${selfUrl.replace(/\/$/, "")}/ping`, (resp) => {
    resp.resume();
  }).on("error", () => {});
}, 10 * 60 * 1000);
