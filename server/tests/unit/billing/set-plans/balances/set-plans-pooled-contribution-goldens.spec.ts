import { describe, expect, test } from "bun:test";
import { getApiBalances } from "@api/customers/cusFeatures";
import {
	BillingInterval,
	CusProductStatus,
	ms,
	type Price,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { customerToScopedBalances } from "@/internal/billing/v2/actions/setPlans/preview/balances/customerToScopedBalances";
import {
	ctx,
	customerWithPools,
	describePooledPhases,
	entityA,
	entityB,
	entityRow,
	ownCreditsPlan,
	pooledCreditsPlan,
	previewPooledBalances,
	RENEWAL,
} from "./pooledCreditsFixtures";

const SECOND_RENEWAL = RENEWAL + ms.days(365);

/** Entity A renews through two saved scheduled plans; entity B pools alongside it throughout. */
const renewingPoolOnTwoEntities = () => {
	const [first, second, third] = ["first", "second", "third"].map((term) =>
		pooledCreditsPlan({
			planId: `enterprise_${term}`,
			pooledAllowance: 10_000,
			pooledEntitlementId: "ent_credits_pooled",
		}),
	);
	return {
		first,
		second,
		third,
		savedRows: [
			entityRow({
				product: first.product,
				entity: entityA,
				rowId: "cp_first_a",
				endedAt: RENEWAL,
			}),
			entityRow({
				product: second.product,
				entity: entityA,
				rowId: "cp_second_a",
				status: CusProductStatus.Scheduled,
				startsAt: RENEWAL,
				endedAt: SECOND_RENEWAL,
			}),
			entityRow({
				product: third.product,
				entity: entityA,
				rowId: "cp_third_a",
				status: CusProductStatus.Scheduled,
				startsAt: SECOND_RENEWAL,
			}),
			entityRow({
				product: first.product,
				entity: entityB,
				rowId: "cp_first_b",
			}),
		],
	};
};

describe(
	chalk.yellowBright("set_plans balance preview: pooled credits"),
	() => {
		test("raising an entity's pooled credits shows on that entity, not as a separate pool row", async () => {
			const enterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 10_000,
			});
			const customEnterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 100_000,
				pooledEntitlementId: "ent_credits_pooled_custom",
				isCustom: true,
			});
			const enterpriseOnA = entityRow({
				product: enterprise.product,
				entity: entityA,
				rowId: "cp_enterprise_a",
			});

			const phaseChanges = await previewPooledBalances({
				current: [enterpriseOnA],
				now: [
					{
						product: customEnterprise.product,
						entity: entityA,
						currentRow: enterpriseOnA,
						customEntitlements: [customEnterprise.pooledEntitlement],
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([
				[
					"ent_a/credits updated: 10000 -> 100000 granted, usage-based, pool 10000 -> 100000 across 1",
				],
			]);
		});

		test("of two entities pooling credits, only the one that changes is listed", async () => {
			const enterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 10_000,
			});
			const customEnterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 30_000,
				pooledEntitlementId: "ent_credits_pooled_custom",
				isCustom: true,
			});
			const enterpriseOnA = entityRow({
				product: enterprise.product,
				entity: entityA,
				rowId: "cp_enterprise_a",
			});
			const enterpriseOnB = entityRow({
				product: enterprise.product,
				entity: entityB,
				rowId: "cp_enterprise_b",
			});

			const phaseChanges = await previewPooledBalances({
				current: [enterpriseOnA, enterpriseOnB],
				now: [
					{
						product: customEnterprise.product,
						entity: entityA,
						currentRow: enterpriseOnA,
						customEntitlements: [customEnterprise.pooledEntitlement],
					},
					{
						product: enterprise.product,
						entity: entityB,
						currentRow: enterpriseOnB,
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([
				[
					"ent_a/credits updated: 10000 -> 30000 granted, usage-based, pool 20000 -> 40000 across 2",
				],
			]);
		});

		test("re-buying an entity's pooled plan with a custom base price keeps its pooled credits", async () => {
			const growth = pooledCreditsPlan({
				planId: "growth",
				pooledAllowance: 10_000,
			});
			const yearlyBase = {
				...prices.createFixed({ id: "price_growth_yearly" }),
				is_custom: true,
			} as Price;
			const customGrowth = pooledCreditsPlan({
				planId: "growth",
				pooledAllowance: 10_000,
				basePrice: {
					...yearlyBase,
					config: {
						...yearlyBase.config,
						amount: 1000,
						interval: BillingInterval.Year,
					},
				} as Price,
			});
			const enterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 10_000,
			});
			const scale = pooledCreditsPlan({
				planId: "scale",
				pooledAllowance: 10_000,
			});
			const growthOnA = entityRow({
				product: growth.product,
				entity: entityA,
				rowId: "cp_growth_a",
			});
			const enterpriseOnB = entityRow({
				product: enterprise.product,
				entity: entityB,
				rowId: "cp_enterprise_b",
				endedAt: RENEWAL,
			});
			const scaleOnB = entityRow({
				product: scale.product,
				entity: entityB,
				rowId: "cp_scale_b",
				status: CusProductStatus.Scheduled,
				startsAt: RENEWAL,
			});

			const phaseChanges = await previewPooledBalances({
				current: [growthOnA, enterpriseOnB, scaleOnB],
				now: [
					{
						product: enterprise.product,
						entity: entityB,
						currentRow: enterpriseOnB,
						scheduledRow: scaleOnB,
					},
					{
						product: customGrowth.product,
						entity: entityA,
						currentRow: growthOnA,
						customPrices: [customGrowth.product.prices[0]],
						ongoing: true,
					},
				],
				later: [
					{
						startsAt: RENEWAL,
						plans: [{ product: scale.product, entity: entityB }],
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([
				[
					"ent_a/credits updated: 10000 -> 10000 granted, usage-based, pool 20000 -> 20000 across 2",
				],
				[],
			]);
		});

		test("scoped balances with pooled grants attributed add up to the customer's API balance", async () => {
			const enterprise = pooledCreditsPlan({
				planId: "enterprise",
				pooledAllowance: 10_000,
			});
			const scale = pooledCreditsPlan({
				planId: "scale",
				pooledAllowance: 30_000,
			});
			const fullCustomer = customerWithPools([
				entityRow({
					product: enterprise.product,
					entity: entityA,
					rowId: "cp_enterprise_a",
				}),
				entityRow({
					product: scale.product,
					entity: entityB,
					rowId: "cp_scale_b",
				}),
			]);

			const scoped = await customerToScopedBalances({ ctx, fullCustomer });
			const { balances: aggregate } = await getApiBalances({
				ctx,
				fullCus: fullCustomer,
			});
			const summed = (field: "granted" | "remaining" | "usage") =>
				scoped.reduce(
					(total, { balances }) => total + (balances.credits?.[field] ?? 0),
					0,
				);

			expect(
				scoped.map(
					({ scope, balances }) =>
						`${scope.entityId ?? "customer"}: ${balances.credits?.granted ?? "none"}`,
				),
			).toEqual(["customer: none", "ent_a: 10000", "ent_b: 30000"]);
			expect([summed("granted"), summed("remaining"), summed("usage")]).toEqual(
				[
					aggregate.credits?.granted,
					aggregate.credits?.remaining,
					aggregate.credits?.usage,
				],
			);
		});

		test("an entity's own credits stay off the pool", async () => {
			const pro = ownCreditsPlan({ planId: "pro", allowance: 1000 });
			const customPro = ownCreditsPlan({
				planId: "pro",
				allowance: 2000,
				entitlementId: "ent_credits_pro_custom",
				isCustom: true,
			});
			const proOnA = entityRow({
				product: pro.product,
				entity: entityA,
				rowId: "cp_pro_a",
			});

			const phaseChanges = await previewPooledBalances({
				current: [proOnA],
				now: [
					{
						product: customPro.product,
						entity: entityA,
						currentRow: proOnA,
						customEntitlements: [customPro.ownEntitlement],
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([
				["ent_a/credits updated: 1000 -> 2000 granted"],
			]);
		});

		test("a two-contributor pool whose saved later phases are declared as they are lists no balance", async () => {
			const { first, second, third, savedRows } = renewingPoolOnTwoEntities();
			const [current, next] = savedRows;

			const phaseChanges = await previewPooledBalances({
				current: savedRows,
				now: [
					{
						product: first.product,
						entity: entityA,
						currentRow: current,
						scheduledRow: next,
					},
					{
						product: first.product,
						entity: entityB,
						currentRow: savedRows[3],
						ongoing: true,
					},
				],
				later: [
					{
						startsAt: RENEWAL,
						plans: [{ product: second.product, entity: entityA }],
					},
					{
						startsAt: SECOND_RENEWAL,
						plans: [{ product: third.product, entity: entityA }],
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([[], [], []]);
		});

		test("leaving a saved middle phase out keeps the later saved phase's pool split by contributor", async () => {
			const { first, third, savedRows } = renewingPoolOnTwoEntities();
			const [current, next] = savedRows;

			const phaseChanges = await previewPooledBalances({
				current: savedRows,
				now: [
					{
						product: first.product,
						entity: entityA,
						currentRow: current,
						scheduledRow: next,
					},
					{
						product: first.product,
						entity: entityB,
						currentRow: savedRows[3],
						ongoing: true,
					},
				],
				later: [
					{
						startsAt: SECOND_RENEWAL,
						plans: [{ product: third.product, entity: entityA }],
					},
				],
			});

			expect(describePooledPhases(phaseChanges)).toEqual([[], []]);
		});
	},
);
