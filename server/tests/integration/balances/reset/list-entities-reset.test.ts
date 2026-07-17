import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	customerEntitlements,
	fullSubjectToCustomerEntitlements,
	isEntityCusEnt,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { setCachedSubjectBalanceField } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/index.js";

const PREFIX = "reset-list-entities-cohort";
const CUSTOMER_ID = PREFIX;
const ENTITY_IDS = Array.from({ length: 4 }, (_, i) => `${PREFIX}-${i + 1}`);
const STALE_IDS = [`${PREFIX}-2`, `${PREFIX}-4`];
const FRESH_IDS = [`${PREFIX}-1`, `${PREFIX}-3`];

const USAGE: Record<string, number> = {
	[`${PREFIX}-1`]: 20,
	[`${PREFIX}-2`]: 35,
	[`${PREFIX}-3`]: 50,
	[`${PREFIX}-4`]: 15,
};

const expireEntityCusEntForReset = async ({
	ctx,
	customerId,
	entityId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	entityId: string;
	featureId: string;
}) => {
	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId,
	});

	if (!fullSubject) {
		throw new Error(
			`FullSubject not found for customer=${customerId} entity=${entityId}`,
		);
	}

	const cusEnt = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
	}).find((candidate) => isEntityCusEnt({ cusEnt: candidate }));

	if (!cusEnt) {
		throw new Error(
			`entity cusEnt not found for customer=${customerId} entity=${entityId} feature=${featureId}`,
		);
	}

	const pastTime = Date.now() - 1000;

	await ctx.db
		.update(customerEntitlements)
		.set({ next_reset_at: pastTime })
		.where(eq(customerEntitlements.id, cusEnt.id));

	await setCachedSubjectBalanceField({
		ctx,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
		customerEntitlementId: cusEnt.id,
		field: "next_reset_at",
		value: pastTime,
	});

	return cusEnt;
};

test.concurrent(`${chalk.yellowBright("list entities reset: queues stale entity entitlement resets through workflow")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const entityPlan = products.base({
		id: "entity-reset-free",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId: CUSTOMER_ID,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [entityPlan] }),
		],
		actions: [],
	});

	// Entity creation is serialized per customer by a lock — create sequentially.
	for (const entityId of ENTITY_IDS) {
		await autumnV2_1.entitiesV2.create({
			customer_id: CUSTOMER_ID,
			entity_id: entityId,
			feature_id: TestFeature.Users,
			name: entityId,
		});
	}

	await Promise.all(
		ENTITY_IDS.map((entityId) =>
			autumnV1.billing.attach({
				customer_id: CUSTOMER_ID,
				product_id: entityPlan.id,
				entity_id: entityId,
			}),
		),
	);

	await Promise.all(
		ENTITY_IDS.map((entityId) =>
			autumnV1.track({
				customer_id: CUSTOMER_ID,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: USAGE[entityId],
			}),
		),
	);
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const expiredCusEnts = await Promise.all(
		STALE_IDS.map((entityId) =>
			expireEntityCusEntForReset({
				ctx,
				customerId: CUSTOMER_ID,
				entityId,
				featureId: TestFeature.Messages,
			}),
		),
	);

	const listRes = await autumnV2_1.entitiesV2.list<{
		list: ApiEntityV2[];
		total: number;
	}>({
		search: PREFIX,
		limit: ENTITY_IDS.length,
	});

	expect(listRes.total).toBe(ENTITY_IDS.length);
	for (const entityId of ENTITY_IDS) {
		expect(listRes.list.find((entity) => entity.id === entityId)).toBeDefined();
	}

	await new Promise((resolve) => setTimeout(resolve, 5000));

	for (const entityId of STALE_IDS) {
		const entity = await autumnV2_1.entities.get<ApiEntityV2>(
			CUSTOMER_ID,
			entityId,
			{ skip_cache: "true" },
		);
		expect(entity.balances[TestFeature.Messages].remaining).toBe(100);
		expect(entity.balances[TestFeature.Messages].usage).toBe(0);
	}

	for (const cusEnt of expiredCusEnts) {
		const [dbCusEnt] = await ctx.db
			.select()
			.from(customerEntitlements)
			.where(eq(customerEntitlements.id, cusEnt.id));
		expect(dbCusEnt.next_reset_at).toBeGreaterThan(Date.now());
	}

	for (const entityId of FRESH_IDS) {
		const entity = await autumnV2_1.entities.get<ApiEntityV2>(
			CUSTOMER_ID,
			entityId,
			{ skip_cache: "true" },
		);
		expect(entity.balances[TestFeature.Messages].remaining).toBe(
			100 - USAGE[entityId],
		);
		expect(entity.balances[TestFeature.Messages].usage).toBe(USAGE[entityId]);
	}
});
