import type {
	ApiVersionClass,
	AppEnv,
	AuthType,
	Feature,
	FullCustomer,
	Organization,
} from "@autumn/shared";
import type { User } from "better-auth";
import type { Redis } from "ioredis";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { OidcClaims } from "@/external/vercel/misc/vercelAuth.js";

export type RolloutSnapshot = {
	rolloutId: string | null;
	enabled: boolean;
	percent: number;
	previousPercent: number;
	changedAt: number;
	customerBucket: number | null;
};

export type RequestContext = {
	// Variables
	org: Organization;
	env: AppEnv;
	features: Feature[];
	user?: User;
	userId?: string;
	customerId?: string;
	entityId?: string;

	// Objects
	db: DrizzleCli;
	dbGeneral: DrizzleCli;
	logger: Logger;
	/** V2 Redis instance for this request. Populated by every ctx-building
	 *  middleware/worker via resolveRedisV2. Never import the singleton directly
	 *  in request-path code. */
	redisV2: Redis;

	// Info
	id: string;
	isPublic: boolean;
	useReplicaDb?: boolean;
	authType: AuthType;
	apiVersion: ApiVersionClass;
	timestamp: number;

	/** Granted auth scopes for this request.
	 *  Empty array `[]` is the legacy/unrestricted signal.
	 *  Stored as raw strings (not ScopeString) because different auth paths
	 *  (secret key, better-auth, public key) may write legacy scope strings
	 *  that haven't been normalised yet; the scope-check middleware
	 *  normalises at check time. Kept as raw strings to keep this file
	 *  dependency-free. */
	scopes: string[];

	// Query params
	expand: string[];
	skipCache: boolean;

	extraLogs: Record<string, unknown>;

	fullCustomer?: FullCustomer;
	rolloutSnapshot?: RolloutSnapshot;

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
