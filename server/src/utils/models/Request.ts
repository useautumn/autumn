import { AppEnv, Feature, MinOrg, Organization } from "@autumn/shared";
import { Logtail } from "@logtail/node";
import { SupabaseClient } from "@supabase/supabase-js";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { Client } from "pg";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { PostHog } from "posthog-node";

export interface ExtendedRequest extends ExpressRequest {
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

  posthog?: PostHog;
}

export interface ExtendedResponse extends ExpressResponse {}
