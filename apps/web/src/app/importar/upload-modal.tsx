"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_BYTES = 25 * 1024 * 1024;

export function UploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Arquivo maior que 25 MB");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);

    startTransition(async () => {
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as
        | { batch_id: string; duplicate?: boolean; status?: string }
        | { error: string; message?: string };

      if (!res.ok || "error" in data) {
        const msg =
          "message" in data && data.message
            ? data.message
            : "error" in data
              ? data.error
              : "Falha no upload";
        setError(msg);
        return;
      }

      // Redireciona pra página de review (mesmo se duplicate, vai pra batch existente)
      router.push(`/importar/${data.batch_id}`);
      router.refresh();
    });

    // Limpa input pra permitir reupload do mesmo arquivo
    e.target.value = "";
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        className="hidden"
        aria-hidden
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
        className="grid h-12 place-items-center rounded-2xl border text-sm font-medium transition disabled:opacity-50"
        style={{
          background: "oklch(0.27 0.04 155 / 0.5)",
          borderColor: "oklch(0.4 0.06 155 / 0.5)",
          color: "oklch(0.92 0.05 155)",
        }}
      >
        {isPending ? "Enviando…" : "Enviar fatura ou extrato"}
      </button>
      <p
        className="text-center text-[11px]"
        style={{ color: "oklch(0.55 0.006 30)" }}
      >
        PNG, JPG, WEBP ou PDF · máx 25 MB
      </p>
      {error ? (
        <p
          className="rounded-xl border px-3 py-2 text-center text-xs"
          style={{
            background: "oklch(0.27 0.06 25 / 0.3)",
            borderColor: "oklch(0.4 0.08 25 / 0.5)",
            color: "oklch(0.85 0.12 25)",
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
