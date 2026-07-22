// Contract: customer/get-or-create/entity/check expose one shared pool using pooled_balances.granted.
// Source entitlements stay private; the exact balance is allowed and one unit above is rejected.

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	ApiEntityV2,
	CheckResponseV3,
} from "@autumn/shared";
import { fullCustomerToCustomerEntitlements } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { getApiCustomer } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomer.js";

const CONTRIBUTION = 500;
const POOLED_GRANT = CONTRIBUTION * 2;

const expectPooledCheck = ({
	response,
	allowed,
	requiredBalance,
}: {
	response: CheckResponseV3;
	allowed: boolean;
	requiredBalance: number;
}) => {
	expect(response).toMatchObject({
		allowed,
		required_balance: requiredBalance,
		balance: {
			granted: POOLED_GRANT,
			remaining: POOLED_GRANT,
			usage: 0,
		},
	});
	expect(response.balance?.breakdown).toHaveLength(1);
	expect(response.balance?.breakdown?.[0]).toMatchObject({
		plan_id: null,
		included_grant: POOLED_GRANT,
		remaining: POOLED_GRANT,
		usage: 0,
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled check: customer and entity reads expose one shared grant with exact boundary checks")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-check-shared",
			items: [
				{
					...items.monthlyMessages({ includedUsage: CONTRIBUTION }),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, customerId, entities } = await initScenario({
			customerId: "pooled-check-shared",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
			],
		});

		const cachedCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const uncachedCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		const getOrCreateCustomer = (await autumnV2_2.post(
			"/customers.get_or_create",
			{ customer_id: customerId },
		)) as ApiCustomerV5;

		for (const customer of [
			cachedCustomer,
			uncachedCustomer,
			getOrCreateCustomer,
		]) {
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				granted: POOLED_GRANT,
				includedGrant: POOLED_GRANT,
				remaining: POOLED_GRANT,
				usage: 0,
				planId: null,
				breakdownCount: 1,
			});
		}

		const legacyFullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			entityId: entities[0].id,
			withEntities: true,
			withSubs: true,
		});
		if (!legacyFullCustomer) {
			throw new Error(`Customer '${customerId}' was not found`);
		}
		const legacyDeductionCandidates = fullCustomerToCustomerEntitlements({
			fullCustomer: legacyFullCustomer,
			featureId: TestFeature.Messages,
			entity: legacyFullCustomer.entity,
		});
		expect(legacyDeductionCandidates).toHaveLength(1);
		expect(legacyDeductionCandidates[0]).toMatchObject({
			is_pooled_balance: true,
			pooled_balance: { granted: POOLED_GRANT },
		});
		const legacyApiCustomer = await getApiCustomer({
			ctx,
			fullCustomer: legacyFullCustomer,
			withAutumnId: true,
		});
		expectBalanceCorrect({
			customer: legacyApiCustomer,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT,
			includedGrant: POOLED_GRANT,
			remaining: POOLED_GRANT,
			usage: 0,
			planId: null,
			breakdownCount: 1,
		});

		const contributingEntity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		const unassignedEntity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[2].id,
			{ skip_cache: "true" },
		);

		for (const entity of [contributingEntity, unassignedEntity]) {
			expectBalanceCorrect({
				customer: entity,
				featureId: TestFeature.Messages,
				granted: POOLED_GRANT,
				includedGrant: POOLED_GRANT,
				remaining: POOLED_GRANT,
				usage: 0,
				planId: null,
				breakdownCount: 1,
			});
		}

		const exactCustomerCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: POOLED_GRANT,
		});
		expectPooledCheck({
			response: exactCustomerCheck,
			allowed: true,
			requiredBalance: POOLED_GRANT,
		});

		const exactEntityCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			required_balance: POOLED_GRANT,
		});
		expectPooledCheck({
			response: exactEntityCheck,
			allowed: true,
			requiredBalance: POOLED_GRANT,
		});

		const abovePoolCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			required_balance: POOLED_GRANT + 1,
			skip_cache: true,
		});
		expectPooledCheck({
			response: abovePoolCheck,
			allowed: false,
			requiredBalance: POOLED_GRANT + 1,
		});
	},
);
