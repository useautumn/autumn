import type {
	ApiVersionClass,
	AppEnv,
	AuthType,
	Feature,
	Organization,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import type {
	Request as ExpressRequest,
	Response as ExpressResponse,
} from "express";
import type { PostHog } from "posthog-node";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export interface ExtendedRequest extends ExpressRequest {
	orgId: string;
	env: AppEnv;
	org: Organization;
	features: Feature[];
	db: DrizzleCli;
	logtail: Logger;
	logger: any;
	clickhouseClient: ClickHouseClient;

	id?: string;
	userId?: string;
	isPublic?: boolean;
	authType?: AuthType;

	posthog?: PostHog;
	apiVersion: ApiVersionClass;

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
