import {
	ApiVersionClass,
	type FeatureConfigOverride,
	FeatureType,
	type FullCustomerEntitlement,
	type FullSubject,
	fullCustomerToFullSubject,
	LATEST_VERSION,
	type NormalizedFullSubject,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { createRedisClient } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildSharedBalanceWrites } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setSharedFullSubjectBalances.js";

/** Runs the real Lua deduction scripts against a local Redis, like the other Redis-only suites. */
export const createZeroCreditCostRedis = ({ region }: { region: string }) =>
	createRedisClient({
		cacheUrl: process.env.HANDOFF_TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
		region,
		redisType: "subject-primary",
	});

export const customerId = "cus_test";
export const messagesFeature = features.create({
	id: "messages",
	name: "Messages",
});

/**
 * The catalog prices messages at `creditAmount` credits; a plan item's
 * `featureOverride` replaces that schema for this balance only.
 */
export const creditRow = ({
	balance,
	unlimited = false,
	creditAmount = 0,
	featureOverride,
}: {
	balance: number;
	unlimited?: boolean;
	creditAmount?: number;
	featureOverride?: FeatureConfigOverride;
}) => {
	const row = customerEntitlements.create({
		id: "credits_row",
		featureId: "credits",
		featureName: "Credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: {
			schema: [
				{
					metered_feature_id: messagesFeature.id,
					feature_amount: 1,
					credit_amount: creditAmount,
				},
			],
		},
		allowance: balance,
		balance,
		usageAllowed: false,
	});
	row.unlimited = unlimited;
	if (featureOverride) row.entitlement.feature_override = featureOverride;
	return row;
};

/** A plan item override pricing messages at `creditAmount` credits. */
export const messagesOverride = ({
	creditAmount,
}: {
	creditAmount: number;
}): FeatureConfigOverride => ({
	schema: [
		{
			metered_feature_id: messagesFeature.id,
			feature_amount: 1,
			credit_amount: creditAmount,
		},
	],
});

export const ownRow = ({
	balance,
	allowance = balance,
}: {
	balance: number;
	allowance?: number;
}) =>
	customerEntitlements.create({
		id: "own_row",
		featureId: messagesFeature.id,
		featureName: "Messages",
		allowance,
		balance,
		usageAllowed: false,
	});

const rowsToBalanceWrites = ({
	ctx,
	rows,
}: {
	ctx: AutumnContext;
	rows: FullCustomerEntitlement[];
}) =>
	buildSharedBalanceWrites({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		customerEntitlements:
			rows as unknown as NormalizedFullSubject["customer_entitlements"],
		aggregatedCustomerEntitlements: [],
	});

/** A customer holding `rows`, with their balances seeded into Redis the way the subject cache stores them. */
export const setupZeroCreditCostSubject = async ({
	redis,
	rows,
}: {
	redis: ReturnType<typeof createZeroCreditCostRedis>;
	rows: FullCustomerEntitlement[];
}) => {
	const fullSubject: FullSubject = fullCustomerToFullSubject({
		fullCustomer: customers.create({
			customerProducts: [
				customerProducts.create({ customerEntitlements: rows }),
			],
		}),
	});
	const creditsFeature = rows.find((row) => row.feature_id === "credits")
		?.entitlement.feature;
	const ctx = contexts.create({
		features: [messagesFeature, ...(creditsFeature ? [creditsFeature] : [])],
	});
	ctx.redisV2 = redis;
	ctx.timestamp = Date.now();
	ctx.apiVersion = new ApiVersionClass(LATEST_VERSION);
	ctx.expand = [];

	const multi = redis.multi();
	for (const { balanceKey, fields } of rowsToBalanceWrites({ ctx, rows })) {
		multi.del(balanceKey).hset(balanceKey, fields);
	}
	await multi.exec();

	return { ctx, fullSubject };
};

/** The cached balance of a row after the script ran, or of a rollover on it. */
export const cachedBalance = async ({
	redis,
	ctx,
	row,
	rolloverId,
}: {
	redis: ReturnType<typeof createZeroCreditCostRedis>;
	ctx: AutumnContext;
	row: FullCustomerEntitlement;
	rolloverId?: string;
}) => {
	const [{ balanceKey }] = rowsToBalanceWrites({ ctx, rows: [row] });
	const cached = JSON.parse((await redis.hget(balanceKey, row.id)) ?? "{}");
	if (!rolloverId) return cached.balance;
	return cached.rollovers.find(
		(rollover: { id: string }) => rollover.id === rolloverId,
	)?.balance;
};
