import { categorizeTransactionFn } from "./categorize-transaction";
import { confirmInboxItem } from "./confirm-inbox-item";
import { parseInboxItem } from "./parse-inbox-item";
import { syncShiftToGcal } from "./sync-shift-to-gcal";

/**
 * Lista de todas as Inngest functions registradas.
 * Adicionar aqui ao criar nova função.
 */
export const functions = [
  parseInboxItem,
  confirmInboxItem,
  categorizeTransactionFn,
  syncShiftToGcal,
];
