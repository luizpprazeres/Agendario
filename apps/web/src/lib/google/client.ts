import { google } from "googleapis";
import { serverEnv } from "@/env";

/**
 * Cria um OAuth2 client novo. Sempre instanciar fresh — não compartilhar
 * entre requests porque o estado de credenciais é mutável.
 */
export function getOAuth2Client() {
  if (
    !serverEnv.GOOGLE_CLIENT_ID ||
    !serverEnv.GOOGLE_CLIENT_SECRET ||
    !serverEnv.GOOGLE_REDIRECT_URI
  ) {
    throw new Error(
      "Google OAuth env vars não configuradas (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)"
    );
  }
  return new google.auth.OAuth2(
    serverEnv.GOOGLE_CLIENT_ID,
    serverEnv.GOOGLE_CLIENT_SECRET,
    serverEnv.GOOGLE_REDIRECT_URI
  );
}

export const GCAL_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export { google };
