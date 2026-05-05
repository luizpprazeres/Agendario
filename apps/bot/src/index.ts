import { Bot, type Context } from "grammy";
import { env } from "./env";

/**
 * Agendario Bot — long-polling local para dev.
 *
 * Cada mensagem recebida é encaminhada para o web app via HTTP POST,
 * que enfileira o processamento via Inngest (parse intent → preview → confirm).
 *
 * Em produção: substituir long-polling por webhook direto no Telegram
 * apontando para `/api/webhooks/telegram` do web app.
 */
const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command("start", async (ctx: Context) => {
  const chatId = ctx.chat?.id;
  await ctx.reply(
    `👋 Olá! Sou o bot do *Agendario*.\n\n` +
      `Seu *chat_id* é \`${chatId}\`.\n\n` +
      `Para vincular sua conta, copie esse ID e cole na aba "Integrações" do web app (em breve).\n\n` +
      `Você já pode me mandar mensagens livres como:\n` +
      `• "Plantão amanhã 19h-7h Hospital Albert Einstein"\n` +
      `• "Almoço delivery 45 reais"\n` +
      `• "Comprar livro de USG quinta"`,
    { parse_mode: "Markdown" }
  );
});

bot.command("ping", async (ctx) => {
  await ctx.reply("pong 🏓");
});

async function forwardToWeb(update: unknown): Promise<Response> {
  return fetch(env.WEB_INTERNAL_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-secret": env.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify(update),
  });
}

// Mensagens de texto livres → encaminhar para webhook web
bot.on("message:text", async (ctx) => {
  try {
    const res = await forwardToWeb(ctx.update);
    if (!res.ok) {
      console.error(
        `[bot] webhook rejected: ${res.status} ${await res.text()}`
      );
      await ctx.reply("⚠️ Erro ao processar mensagem. Verifique se o web app está rodando.");
      return;
    }
    // Confirmação rápida (UI de preview vem depois via Inngest → callback)
    await ctx.reply("⏳ Processando...");
  } catch (err) {
    console.error("[bot] webhook fetch failed:", err);
    await ctx.reply(
      "⚠️ Não consegui falar com o servidor. O web app está rodando em localhost:3000?"
    );
  }
});

// Cliques em botões inline (✅ Confirmar / ❌ Cancelar) → encaminhar
bot.on("message:photo", async (ctx) => {
  try {
    const res = await forwardToWeb(ctx.update);
    if (!res.ok) {
      console.error(
        `[bot] photo webhook rejected: ${res.status} ${await res.text()}`
      );
      await ctx.reply("⚠️ Erro ao receber a fatura. Web app está rodando?");
      return;
    }
    // Webhook responde com link após processar — não duplica mensagem aqui
  } catch (err) {
    console.error("[bot] photo webhook fetch failed:", err);
    await ctx.reply(
      "⚠️ Não consegui falar com o servidor. O web app está rodando em localhost:3000?"
    );
  }
});

bot.on("message:document", async (ctx) => {
  try {
    const res = await forwardToWeb(ctx.update);
    if (!res.ok) {
      console.error(
        `[bot] document webhook rejected: ${res.status} ${await res.text()}`
      );
      await ctx.reply("⚠️ Erro ao receber o documento. Web app está rodando?");
      return;
    }
  } catch (err) {
    console.error("[bot] document webhook fetch failed:", err);
    await ctx.reply(
      "⚠️ Não consegui falar com o servidor. O web app está rodando em localhost:3000?"
    );
  }
});

bot.on("callback_query:data", async (ctx) => {
  try {
    const res = await forwardToWeb(ctx.update);
    if (!res.ok) {
      console.error(
        `[bot] callback webhook rejected: ${res.status} ${await res.text()}`
      );
      await ctx.answerCallbackQuery({
        text: "Erro ao processar. Web app rodando?",
        show_alert: true,
      });
    }
    // Caso ok: o web app já chamou answerCallbackQuery, então não fazemos aqui
    // (Telegram aceita 2 chamadas mas só a 1ª efeita; deixa o web responder).
  } catch (err) {
    console.error("[bot] callback webhook fetch failed:", err);
    await ctx.answerCallbackQuery({
      text: "Servidor offline.",
      show_alert: true,
    });
  }
});

bot.catch((err) => {
  console.error("[bot] unhandled error:", err);
});

console.log("🤖 Agendario bot iniciando em modo long-polling...");
console.log(`   → Encaminhando mensagens para: ${env.WEB_INTERNAL_WEBHOOK_URL}`);
console.log("   → Envie /start para o bot no Telegram para verificar.");

await bot.start({
  onStart: (info) => {
    console.log(`✅ Bot @${info.username} pronto.`);
  },
});
