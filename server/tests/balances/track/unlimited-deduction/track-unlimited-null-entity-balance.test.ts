/**
 * Entity-scoped unlimited cusEnts can store entities[id].balance = null
 * (legacy unlimited slot). Track Lua write path uses (balance or 0);
 * cjson.null is truthy so the add crashes and track fail-opens to SQS.
 *
 * Red (current):  track against a seeded null entity slot returns a queued
 *                 response (no unlimited mask) and the raw entity balance
 *                 never becomes -1.
 * Green (after):  track succeeds (unlimited: true) and the raw entity
 *                 balance becomes -1.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	fullCustomerToCustomerEntitlements,
	type ProductItem,
	type TrackResponseV3,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { findCustomerEntitlement } from "../../utils/findCustomerEntitlement.js";
import { seedLegacyNullEntityBalance } from "./unlimitedDeductionTestUtils.js";

const POLL_TIMEOUT_MS = 30_000;
const ENTITY_ID = "ent-1";

const entityScopedUnlimitedMessages = (): ProductItem => ({
	...constructFeatureItem({
		featureId: TestFeature.Messages,
		unlimited: true,
	}),
	entity_feature_id: TestFeature.Users,
});

const expectEntityRawBalance = async ({
	ctx,
	customerId,
	expectedBalance,
	unlimitedOnly = false,
}: {
	ctx: TestContext;
	customerId: string;
	expectedBalance: number;
	unlimitedOnly?: boolean;
}) => {
	const balances = await pollUntil({
		fetch: async () => {
			const fullCustomer = await CusService.getFull({
				ctx,
				idOrInternalId: customerId,
			});
			const cusEnts = fullCustomerToCustomerEntitlements({
				fullCustomer,
				featureId: TestFeature.Messages,
			});
			const cusEnt = unlimitedOnly
				? cusEnts.find((row) => row.unlimited)
				: cusEnts[0];
			return Object.values(cusEnt?.entities ?? {}).map(
				(entityBalance) => entityBalance.balance,
			);
		},
		until: (entityBalances) =>
			entityBalances.some((balance) => balance === expectedBalance),
		timeoutMs: POLL_TIMEOUT_MS,
	});

	expect(balances).toContain(expectedBalance);
};

test.concurrent(
	`${chalk.yellowBright("unlimited-null-entity: track on legacy balance:null entity slot deducts instead of fail-opening")}`,
	async () => {
		const customerId = "unlim-null-entity";

		const product = products.base({
			id: "unlim-null-entity-prod",
			items: [entityScopedUnlimitedMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await autumnV2_3.customers.get(customerId);

		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt?.id).toBeDefined();
		expect(cusEnt?.unlimited).toBe(true);

		await seedLegacyNullEntityBalance({
			ctx,
			customerId,
			customerEntitlementId: cusEnt!.id,
			entityId: ENTITY_ID,
			featureId: TestFeature.Messages,
		});

		const track = (await autumnV2_3.track({
			customer_id: customerId,
			entity_id: ENTITY_ID,
			feature_id: TestFeature.Messages,
			value: 1,
		})) as TrackResponseV3;

		expect(track.balance?.unlimited).toBe(true);

		await expectEntityRawBalance({
			ctx,
			customerId,
			expectedBalance: -1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("unlimited-null-entity: mixed unlimited+finite still absorbs on the null unlimited slot")}`,
	async () => {
		const customerId = "unlim-null-mixed";

		const unlimitedProd = products.base({
			id: "unlim-null-mixed-unlim",
			items: [entityScopedUnlimitedMessages()],
		});
		const limitedProd = products.base({
			id: "unlim-null-mixed-lim",
			items: [items.monthlyMessages({ includedUsage: 150 })],
			isAddOn: true,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimitedProd, limitedProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: limitedProd.id }),
				s.attach({ productId: unlimitedProd.id }),
			],
		});

		await autumnV2_3.customers.get(customerId);

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId: TestFeature.Messages,
		});
		const unlimitedCusEnt = cusEnts.find((row) => row.unlimited);
		const limitedCusEnt = cusEnts.find((row) => !row.unlimited);
		expect(unlimitedCusEnt?.id).toBeDefined();
		expect(limitedCusEnt?.id).toBeDefined();

		await seedLegacyNullEntityBalance({
			ctx,
			customerId,
			customerEntitlementId: unlimitedCusEnt!.id,
			entityId: ENTITY_ID,
			featureId: TestFeature.Messages,
		});

		const track = (await autumnV2_3.track({
			customer_id: customerId,
			entity_id: ENTITY_ID,
			feature_id: TestFeature.Messages,
			value: 1,
		})) as TrackResponseV3;

		expect(track.balance?.unlimited).toBe(true);

		await expectEntityRawBalance({
			ctx,
			customerId,
			expectedBalance: -1,
			unlimitedOnly: true,
		});

		const limitedRow = await pollUntil({
			fetch: async () => {
				const [row] = await ctx.db
					.select({ balance: customerEntitlements.balance })
					.from(customerEntitlements)
					.where(eq(customerEntitlements.id, limitedCusEnt!.id));
				return row?.balance ?? null;
			},
			until: (balance) => balance === 150,
			timeoutMs: POLL_TIMEOUT_MS,
		});
		expect(limitedRow).toBe(150);
	},
);
