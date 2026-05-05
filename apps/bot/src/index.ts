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

// Mensagens de texto livres → encaminhar para webhook web
bot.on("message:text", async (ctx) => {
  const update = ctx.update;
  try {
    const res = await fetch(env.WEB_INTERNAL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": env.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify(update),
    });
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
