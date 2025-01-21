import { createSupabaseClient } from "@/external/supabaseUtils.js";

import { AppEnv } from "@autumn/shared";
import postgres from "postgres";
import pg from "pg";

const createPostgresClient = () => {
  return postgres(process.env.SUPABASE_CONNECTION_STRING || "");
};

export const createPgClient = () => {
  return new pg.Client(process.env.SUPABASE_CONNECTION_STRING || "");
};

export const envMiddleware = (req: any, res: any, next: any) => {
  req.sb = createSupabaseClient();
  req.psql = createPostgresClient();
  req.env = req.env = req.headers["app_env"] || AppEnv.Sandbox;
  next();
};
