import { AppEnv, Feature, MinOrg, Organization } from "@autumn/shared";
import { Logtail } from "@logtail/node";
import { SupabaseClient } from "@supabase/supabase-js";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Client } from "pg";
import * as schema from "@/db/schema/index.js";
import postgres from "postgres";
import { DrizzleCli } from "@/db/initDrizzle.js";

export interface Request extends ExpressRequest {
  sb: SupabaseClient;
  pg: Client;
  db: DrizzleCli;

  userId?: string;

  logtail: Logtail;
  orgId: string;
  env: AppEnv;

  minOrg: MinOrg;
  org: Organization;
  features: Feature[];
}

export interface Response extends ExpressResponse {}
