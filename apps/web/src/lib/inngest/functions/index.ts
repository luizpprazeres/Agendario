import { confirmInboxItem } from "./confirm-inbox-item";
import { parseInboxItem } from "./parse-inbox-item";

/**
 * Lista de todas as Inngest functions registradas.
 * Adicionar aqui ao criar nova função.
 */
export const functions = [parseInboxItem, confirmInboxItem];
