import { Inngest, EventSchemas } from "inngest";

/**
 * Schema de eventos do Agendario.
 * Adicionar aqui qualquer evento novo para typing forte.
 */
type Events = {
  "telegram/message.received": {
    data: {
      user_id: string | null;
      telegram_chat_id: string;
      telegram_user_id: string;
      message_id: string;
      text: string;
      received_at: string;
    };
  };
  "inbox/item.parse-requested": {
    data: { inbox_item_id: string };
  };
  "inbox/item.confirmed": {
    data: { inbox_item_id: string };
  };
  "transactions/categorize-requested": {
    data: { transaction_id: string };
  };
  "shifts/generate-from-templates": {
    data: { user_id: string; until: string };
  };
  "gcal/sync-pull": {
    data: { user_id: string; calendar_id: string };
  };
  "gcal/sync-push": {
    data: { entity_table: string; entity_id: string };
  };
  "insights/monthly.generate": {
    data: { user_id: string; period_start: string; period_end: string };
  };
};

export const inngest = new Inngest({
  id: "agendario",
  schemas: new EventSchemas().fromRecord<Events>(),
});
