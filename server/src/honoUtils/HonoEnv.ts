import type {
	ApiVersionClass,
	AppEnv,
	AuthType,
	Feature,
	Organization,
} from "@autumn/shared";
import type { User } from "better-auth";
import type { Redis } from "ioredis";
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
	dbGeneral: DrizzleCli;
	logger: Logger;
	/** The Redis instance for this request. For orgs with redis_config set, this is
	 *  their dedicated Redis. For all others, this is the master Redis singleton.
	 *  Set by orgRedisMiddleware after auth resolves ctx.org. */
	redis: Redis;

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
		eventId?: string;
		keepInternalFields?: boolean;
		useReplica?: boolean;
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
