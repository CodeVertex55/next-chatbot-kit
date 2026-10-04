/**
 * Import this first. ES modules run in import order, so the variables from
 * .env.local are in place before any later import reads process.env.
 */
import path from "node:path";
import { loadLocalEnv } from "./env-file";

loadLocalEnv(path.resolve(import.meta.dirname, "..", ".env.local"));
