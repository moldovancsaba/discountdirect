import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";
import { createGdsConfig } from "@sovereignsquad/gds-eslint-config";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...createGdsConfig(),
  globalIgnores([".next/**", ".vercel/**", "next-env.d.ts"]),
]);
