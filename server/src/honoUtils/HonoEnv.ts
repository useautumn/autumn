import type {
	ApiVersionClass,
	AppEnv,
	AuthType,
	Feature,
	Organization,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
import type { User } from "better-auth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { OidcClaims } from "@/external/vercel/misc/vercelAuth.js";

export type RequestContext = {
	// Variables
	org: Organization;
	env: AppEnv;
	features: Feature[];
	user?: User;
	userId?: string;
	customerId?: string;

	// Objects
	db: DrizzleCli;
	logger: Logger;
	clickhouseClient?: ClickHouseClient;

	// Info
	id: string;
	isPublic: boolean;
	authType: AuthType;
	apiVersion: ApiVersionClass;
	timestamp: number;

	// Query params
	expand: string[];
	skipCache: boolean;

	extraLogs: Record<string, unknown>;

	testOptions?: {
		skipCacheDeletion?: boolean;
		skipWebhooks?: boolean;
	};
};

export type AutumnContext = RequestContext;

export type HonoEnv = {
	Variables: {
		ctx: AutumnContext;
		validated: boolean;
		vercelClaims?: OidcClaims;
	};
};
