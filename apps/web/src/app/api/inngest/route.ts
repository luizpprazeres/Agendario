import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Endpoint para o Inngest dev server e prod cloud.
 * Local: `pnpm dlx inngest-cli@latest dev -u http://localhost:3000/api/inngest`
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
