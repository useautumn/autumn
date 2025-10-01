import type { AppEnv, AuthType, Feature, Organization } from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

export type RequestContext = {
	// Variables
	org: Organization;
	env: AppEnv;
	features: Feature[];
	userId?: string;

	// Objects
	db: DrizzleCli;
	logger: Logger;
	clickhouseClient: ClickHouseClient;

	// Info
	id: string;
	isPublic: boolean;
	authType: AuthType;
	apiVersion: string;
	timestamp: number;
};

export type AutumnContext = RequestContext;

export type HonoEnv = {
	Variables: { ctx: AutumnContext };
};
