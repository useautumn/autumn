import { expect, test } from "bun:test";
import type {
	ApiCustomer,
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
} from "@autumn/shared";
import { RolloverExpiryDurationType } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import {
	fetchCustomerEntitlementRow,
	fetchRollovers,
	runBatchResetV2,
	waitForPostgresBalance,
} from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const INCLUDED_USAGE = 100;
const ROLLOVER_CONFIG = {
	max: 1000,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

const waitForEntitiesSynced = async ({
	db,
	customerEntitlementId,
	predicate,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
	predicate: (entities: Record<string, { balance: number }>) => boolean;
}) => {
	const startedAt = Date.now();
	while (true) {
		const row = await fetchCustomerEntitlementRow({
			db,
			customerEntitlementId,
		});
		const entities = (row.entities ?? {}) as Record<
			string,
			{ balance: number }
		>;
		if (predicate(entities)) return;
		if (Date.now() - startedAt > 15_000) {
			throw new Error(
				`entity deduction never synced to PG: ${JSON.stringify(entities)}`,
			);
		}
		await timeout(500);
	}
};

test.concurrent(
	`${chalk.yellowBright("rollover granted: flat ent keeps granted at the rolled-in amount while balance drains")}`,
	async () => {
		const customerId = "rollover-granted-flat";
		const plan = products.base({
			id: "rollover-granted-flat-plan",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: INCLUDED_USAGE,
					rolloverConfig: ROLLOVER_CONFIG,
				}),
			],
		});

		const { ctx, autumnV1, autumnV2, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 70,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			expectedBalance: INCLUDED_USAGE - 70,
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].balance).toBe(30);

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await timeout(3000);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		const messages = customer.balances[TestFeature.Messages];
		expect(messages.rollovers?.length).toBe(1);
		expect(messages.rollovers?.[0].granted).toBe(30);
		expect(messages.rollovers?.[0].balance).toBe(20);

		const rolloverGranted = (messages.rollovers ?? []).reduce(
			(total, rollover) => total + rollover.granted,
			0,
		);
		expect(messages.granted).toBe(INCLUDED_USAGE + rolloverGranted);
		expect(messages.remaining).toBe(INCLUDED_USAGE + 20);
		expect(messages.usage).toBe(10);

		const customerV2_0 = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		const messagesV2_0 = customerV2_0.balances[TestFeature.Messages];
		expect(messagesV2_0.rollovers?.[0].granted).toBe(30);
		expect(messagesV2_0.rollovers?.[0].balance).toBe(20);

		const customerV1_2 = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		const messagesV1_2 = customerV1_2.features[TestFeature.Messages];
		const legacyRollover = messagesV1_2.rollovers?.[0] as
			| Record<string, unknown>
			| undefined;
		expect(legacyRollover?.balance).toBe(20);
		expect(legacyRollover?.granted).toBeUndefined();

		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const cachedCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const cachedMessages = cachedCustomer.balances[TestFeature.Messages];
		expect(cachedMessages.rollovers).toEqual(messages.rollovers);
		expect(cachedMessages.rollovers?.[0].granted).toBe(30);
		expect(cachedMessages.rollovers?.[0].balance).toBe(20);
		expect(cachedMessages.granted).toBe(messages.granted);
	},
);

test.concurrent(
	`${chalk.yellowBright("rollover granted: entity read is per-entity, customer read aggregates across entities")}`,
	async () => {
		const customerId = "rollover-granted-entity";
		const plan = products.base({
			id: "rollover-granted-entity-plan",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Messages,
					includedUsage: INCLUDED_USAGE,
					entityFeatureId: TestFeature.Users,
					rolloverConfig: ROLLOVER_CONFIG,
				}),
			],
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					entityIndex: 0,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await waitForEntitiesSynced({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			predicate: (entities) =>
				Object.values(entities).some(
					(entity) => entity.balance === INCLUDED_USAGE - 40,
				),
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await timeout(3000);

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			"ent-1",
			{ skip_cache: "true" },
		);
		const entityMessages = entity.balances[TestFeature.Messages];
		expect(entityMessages.rollovers?.length).toBe(1);
		expect(entityMessages.rollovers?.[0].granted).toBe(60);
		expect(entityMessages.rollovers?.[0].balance).toBe(50);
		expect(entityMessages.granted).toBe(INCLUDED_USAGE + 60);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		const messages = customer.balances[TestFeature.Messages];
		expect(messages.rollovers?.length).toBe(1);
		expect(messages.rollovers?.[0].granted).toBe(160);
		expect(messages.rollovers?.[0].balance).toBe(150);
	},
);
