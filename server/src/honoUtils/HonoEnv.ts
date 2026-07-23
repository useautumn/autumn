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
	oauthResource?: string;
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
	/** True when this request authenticated via a per-customer JWT. Set by
	 *  customerJwtMiddleware; read by customerJwtVersionMiddleware to enforce
	 *  the v2.3+ floor. */
	isCustomerJwt?: boolean;
	/** Verified per-customer JWT claims. Set by customerJwtMiddleware; read by
	 *  keys.refresh to rotate the family. */
	customerJwt?: {
		customerId: string;
		internalCustomerId: string;
		epoch: number;
		refreshKid: number;
	};
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

	/** True when the context is built by `createTriggerContext` — i.e. we're
	 *  executing inside a Trigger.dev task. Read by `checkPendingMigrationsForCustomer`
	 *  to short-circuit: a migration task loads `CusService.getFull` /
	 *  `getFullSubject` for its target customer, and that load must NOT
	 *  re-enqueue another migration task. */
	insideTriggerTask?: boolean;

	extraLogs: Record<string, unknown>;

	fullCustomer?: FullCustomer;
	rolloutSnapshot?: RolloutSnapshot;

	/** Org is over its aggregate rate cap — check/track flows skip the DB and
	 *  serve their fail-open responses (allow / SQS queue) instead. */
	orgRateLimitDegraded?: boolean;

	testOptions?: {
		skipCacheDeletion?: boolean;
		skipWebhooks?: boolean;
		/** Per-request sync-coalesce gate override (non-prod only); undefined
		 *  falls through to the edge config. */
		syncCoalesce?: boolean;
		eventId?: string;
		keepInternalFields?: boolean;
		useReplica?: boolean;
		mockVercelApi?: boolean;
		allowVercelTestOidc?: boolean;
		mockRevenueCat?: boolean;
		revenueCat?: {
			subscriptions?: unknown[];
			purchases?: unknown[];
			products?: unknown[];
		};
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
