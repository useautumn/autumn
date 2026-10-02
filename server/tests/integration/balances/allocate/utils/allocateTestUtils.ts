import { expect } from "bun:test";
import {
	type AllocateBalancesParamsV0,
	ApiVersion,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { runResetOnCustomerEntitlement } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { sql } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expireUsageWindowForReset } from "../../utils/usage-limit-utils/expireUsageWindowForReset.js";
import { queryRows } from "../../utils/usage-limit-utils/usageWindowDbTestUtils.js";

export const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

/** A customer with one monthly shared messages pool and `entityCount` entities, caches warm. */
export const setupSharedPool = async ({
	customerId,
	includedUsage = 10000,
	entityCount = 3,
}: {
	customerId: string;
	includedUsage?: number;
	entityCount?: number;
}) => {
	const shared = products.base({
		id: `${customerId}-shared`,
		items: [items.monthlyMessages({ includedUsage })],
	});
	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [shared] }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: shared.id })],
	});
	const entityIds = entities.map((entity) => entity.id);
	await warmCaches({ customerId, entityIds });
	return { ctx, entityIds };
};

/** Warms customer and entity caches so a track isn't lost to a cold customer refill. */
export const warmCaches = async ({
	customerId,
	entityIds,
}: {
	customerId: string;
	entityIds: string[];
}) => {
	await autumnV2_3.customers.get(customerId);
	for (const entityId of entityIds)
		await autumnV2_3.entities.get(customerId, entityId);
};

export const allocateMessages = ({
	customerId,
	allocations,
	interval = ResetInterval.Month,
}: {
	customerId: string;
	allocations: AllocateBalancesParamsV0["allocations"];
	interval?: ResetInterval;
}) =>
	autumnV2_3.balances.allocate({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval,
		allocations,
	});

export const trackMessages = ({
	customerId,
	entityId,
	value,
}: {
	customerId: string;
	entityId?: string;
	value: number;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value,
	});

export const isMessagesAllowed = async ({
	customerId,
	entityId,
	requiredBalance,
}: {
	customerId: string;
	entityId?: string;
	requiredBalance: number;
}) =>
	(
		await autumnV2_3.check({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Messages,
			required_balance: requiredBalance,
		})
	).allowed;

const sharedMessagesRows = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) =>
	queryRows(
		await ctx.db.execute(sql`
			SELECT ce.id, ce.balance FROM customer_entitlements ce
			JOIN customer_products cp ON cp.id = ce.customer_product_id
			JOIN customers c ON c.internal_id = ce.internal_customer_id
			WHERE c.id = ${customerId} AND c.org_id = ${ctx.org.id}
				AND c.env = ${ctx.env} AND ce.feature_id = ${TestFeature.Messages}
				AND cp.status = 'active' AND cp.internal_entity_id IS NULL
				AND ce.internal_entity_id IS NULL
		`),
	);

/** Waits until the shared rows' remaining balance in Postgres sums to `remainingBalance`, for steps that drop the cache. */
export const waitForSharedBalanceInDb = ({
	ctx,
	customerId,
	remainingBalance,
}: {
	ctx: TestContext;
	customerId: string;
	remainingBalance: number;
}) =>
	pollUntilAsserted({
		fetch: () => sharedMessagesRows({ ctx, customerId }),
		assert: (rows) =>
			expect(rows.reduce((sum, row) => sum + Number(row.balance), 0)).toBe(
				remainingBalance,
			),
	});

/** Starts a new cycle on every shared messages row: backdates the reset, then runs the reset cron. */
export const resetSharedCycle = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	// A real reset moves the window a whole interval; the forced one only moves it seconds.
	await expireUsageWindowForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	for (const row of await sharedMessagesRows({ ctx, customerId })) {
		await ctx.db.execute(sql`
			UPDATE customer_entitlements SET next_reset_at = ${Date.now() - 1000}
			WHERE id = ${row.id}
		`);
		await runResetOnCustomerEntitlement({
			ctx,
			customerId,
			customerEntitlementId: row.id,
		});
	}
};
