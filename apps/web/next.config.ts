import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite import direto do @agendario/db (TS source) sem build prévio
  transpilePackages: ["@agendario/db"],
  // typedRoutes ainda não é compatível com Turbopack no Next 15.0.3.
  // Reabilitar quando suporte chegar.
};

export default nextConfig;
