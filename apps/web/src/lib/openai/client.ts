import OpenAI from "openai";
import { serverEnv } from "@/env";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  if (!serverEnv.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada em .env.local");
  }
  _client = new OpenAI({ apiKey: serverEnv.OPENAI_API_KEY });
  return _client;
}
