import type {
	ApiVersionClass,
	AppEnv,
	AuthType,
	Feature,
	Organization,
	User,
} from "@autumn/shared";
import type { ClickHouseClient } from "@clickhouse/client";
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

	// For test...
	skipCacheDeletion?: boolean;

	// Optional (should be populated in Stripe customer?)
	customerId?: string;
};

export type AutumnContext = RequestContext;

export type HonoEnv = {
	Variables: {
		ctx: AutumnContext;
		validated: boolean;
		vercelClaims?: OidcClaims;
	};
};
