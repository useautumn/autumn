import { AppEnv, AuthType, Feature, Organization } from "@autumn/shared";
import { Logtail } from "@logtail/node";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

import { DrizzleCli } from "@/db/initDrizzle.js";
import { PostHog } from "posthog-node";
import { Logger } from "pino";
import { ClickHouseClient } from "@clickhouse/client";

export interface ExtendedRequest extends ExpressRequest {
  orgId: string;
  env: AppEnv;
  org: Organization;
  features: Feature[];
  db: DrizzleCli;
  logtail: Logtail;
  logger: Logger;
  clickhouseClient: ClickHouseClient;

  id?: string;
  userId?: string;
  isPublic?: boolean;
  authType?: AuthType;

  posthog?: PostHog;
  apiVersion?: number;

  timestamp?: number;
}

export interface ActionRequest {
  id: string;
  authType: AuthType;
  method: string;
  path: string;
  body: any;
  timestamp: number;
}

export interface ExtendedResponse extends ExpressResponse {}
