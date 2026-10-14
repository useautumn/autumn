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
import type { LogRequestContext } from "@/utils/logging/loggerTypes.js";

export type RequestContext = {
	org: Organization;
	env: AppEnv;
	features: Feature[];
	user?: User;
	userId?: string;
	apiKeyId?: string;
	impersonatedBy?: string;
	customerId?: string;
	entityId?: string;
	requestBody?: unknown;
	requestLogContext?: LogRequestContext;

	db: DrizzleCli;
	dbGeneral: DrizzleCli;
	logger: Logger;
	redisV2: Redis;

	id: string;
	isPublic: boolean;
	useReplicaDb?: boolean;
	authType: AuthType;
	isCustomerJwt?: boolean;
	customerJwt?: {
		customerId: string;
		internalCustomerId: string;
		epoch: number;
		refreshKid: number;
	};
	apiVersion: ApiVersionClass;
	timestamp: number;

	scopes: string[];

	expand: string[];
	skipCache: boolean;

	insideTriggerTask?: boolean;

	extraLogs: Record<string, unknown>;

	state: Record<string, unknown>;

	fullCustomer?: FullCustomer;

	subjectReadTrace?: { source?: "primary" | "replica" | "cache" };

	orgRateLimitDegraded?: boolean;
	skipSubjectCacheDeletion?: boolean;

	testOptions?: {
		asyncBalanceUpdate?: boolean;
		skipCacheDeletion?: boolean;
		skipWebhooks?: boolean;
		syncCoalesce?: boolean;
		eventId?: string;
		keepInternalFields?: boolean;
		useReplica?: boolean;
		mockVercelApi?: boolean;
		allowVercelTestOidc?: boolean;
		mockRevenueCat?: boolean;
		balanceWorkerOutage?: boolean;
		listScanCap?: number;
		billingFeatures?: Partial<Record<string, boolean>>;
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
