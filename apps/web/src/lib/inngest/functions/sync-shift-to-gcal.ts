import { and, asc, eq, inArray } from "drizzle-orm";
import { googleCalendars, shifts, workplaces } from "@agendario/db";
import { inngest } from "../client";
import { getDb } from "@/lib/db";
import { google } from "@/lib/google/client";
import { getAuthorizedClient } from "@/lib/google/tokens";

/**
 * Sync de shift → Google Calendar (one-way).
 *
 * Escolha do calendário: primeiro `googleCalendars` do usuário com
 * `sync_enabled=true` e `sync_direction in ('push', 'both')`. Se nenhum,
 * skip silencioso (não é erro — usuário pode não ter conectado ainda).
 *
 * Idempotência: se o shift já tem `gcal_event_id`, faz UPDATE do evento
 * em vez de INSERT. Se evento foi deletado externamente (404/410),
 * recria.
 */
export const syncShiftToGcal = inngest.createFunction(
  { id: "sync-shift-to-gcal", retries: 3 },
  { event: "gcal/sync-push" },
  async ({ event, step, logger }) => {
    const { entity_table, entity_id } = event.data;
    if (entity_table !== "shifts") {
      return { skipped: `entity_table:${entity_table}` };
    }

    const ctx = await step.run("load-shift-and-workplace", async () => {
      const db = getDb();
      const [shift] = await db
        .select()
        .from(shifts)
        .where(eq(shifts.id, entity_id))
        .limit(1);
      if (!shift) return null;
      const [workplace] = shift.workplace_id
        ? await db
            .select()
            .from(workplaces)
            .where(eq(workplaces.id, shift.workplace_id))
            .limit(1)
        : [null];
      return { shift, workplace: workplace ?? null };
    });

    if (!ctx) {
      logger.warn("Shift not found", { entity_id });
      return { skipped: "shift_not_found" };
    }

    const { shift, workplace } = ctx;

    const auth = await getAuthorizedClient(shift.user_id);
    if (!auth) {
      logger.info("Google not connected", { user_id: shift.user_id });
      return { skipped: "google_not_connected" };
    }

    const calendar = await step.run("pick-calendar", async () => {
      const db = getDb();
      const cals = await db
        .select({
          calendar_id: googleCalendars.calendar_id,
          summary: googleCalendars.summary,
          primary: googleCalendars.primary,
        })
        .from(googleCalendars)
        .where(
          and(
            eq(googleCalendars.user_id, shift.user_id),
            eq(googleCalendars.sync_enabled, true),
            inArray(googleCalendars.sync_direction, ["push", "both"])
          )
        )
        .orderBy(asc(googleCalendars.summary));
      // Prefer primary se houver
      return cals.find((c) => c.primary) ?? cals[0] ?? null;
    });

    if (!calendar) {
      logger.info("No sync-enabled calendar", { user_id: shift.user_id });
      return { skipped: "no_calendar_enabled" };
    }

    const gcal = google.calendar({ version: "v3", auth: auth.client });

    const eventBody = {
      summary:
        shift.title ??
        (workplace ? `Plantão · ${workplace.name}` : "Plantão"),
      description: [
        workplace?.name ? `Local: ${workplace.name}` : null,
        shift.notes,
        shift.pay_cents
          ? `Pagamento: R$ ${(Number(shift.pay_cents) / 100).toFixed(2)}`
          : null,
        "",
        `Agendario · shift_id: ${shift.id}`,
      ]
        .filter((v) => v !== null)
        .join("\n"),
      start: { dateTime: new Date(shift.starts_at).toISOString() },
      end: { dateTime: new Date(shift.ends_at).toISOString() },
      extendedProperties: {
        private: { agendario_shift_id: shift.id },
      },
    };

    const result = await step.run("upsert-event", async () => {
      if (shift.gcal_event_id) {
        try {
          const r = await gcal.events.update({
            calendarId: calendar.calendar_id,
            eventId: shift.gcal_event_id,
            requestBody: eventBody,
          });
          return r.data;
        } catch (err: unknown) {
          const code = (err as { code?: number })?.code;
          if (code === 404 || code === 410) {
            // Evento foi deletado no GCal — recria
            const r = await gcal.events.insert({
              calendarId: calendar.calendar_id,
              requestBody: eventBody,
            });
            return r.data;
          }
          throw err;
        }
      }
      const r = await gcal.events.insert({
        calendarId: calendar.calendar_id,
        requestBody: eventBody,
      });
      return r.data;
    });

    await step.run("save-event-ref", async () => {
      const db = getDb();
      await db
        .update(shifts)
        .set({
          gcal_event_id: result.id ?? null,
          gcal_calendar_id: calendar.calendar_id,
          gcal_etag: result.etag ?? null,
        })
        .where(eq(shifts.id, shift.id));
    });

    return {
      ok: true,
      event_id: result.id,
      calendar_id: calendar.calendar_id,
    };
  }
);
