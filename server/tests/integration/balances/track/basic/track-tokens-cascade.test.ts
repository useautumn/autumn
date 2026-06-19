import { expect, test } from "bun:test";

import type {
	ApiCustomerV5,
	ApiEntityV2,
	TrackResponseV3,
} from "@autumn/shared";
import { ApiVersion, ErrCode, FeatureType } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// Two AI credit systems on one customer form a cascade: the system without a
// usage-based price ("included") drains first, floored at zero, and the
// remainder spills into the usage-priced system ("overage") in that system's
// own cost domain.
//
// Each scenario creates throwaway features (never the shared AiCredits
// fixtures) pricing the same custom model at different markups:
//   included markup:  0% → cost = base
//   overage markup:  50% → cost = base × 1.5
// Model rates: input 5 $/M, output 15 $/M.
// 200k input + 200k output → base = $4, included cost = $4, overage cost = $6.

const CASCADE_MODEL = "custom/cascade-model";

const createCascadeFeatures = async ({ withSecondIncluded = false } = {}) => {
	const autumn = new AutumnInt({ version: ApiVersion.V2_2 });
	const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const includedFeatureId = `ai_cascade_inc_${suffix}`;
	const overageFeatureId = `ai_cascade_ovg_${suffix}`;
	const secondIncludedFeatureId = withSecondIncluded
		? `ai_cascade_inc2_${suffix}`
		: undefined;

	await autumn.post("/features.create", {
		feature_id: includedFeatureId,
		name: "AI Cascade Included",
		type: FeatureType.AiCreditSystem,
		model_markups: {
			[CASCADE_MODEL]: { markup: 0, input_cost: 5, output_cost: 15 },
		},
	});
	if (secondIncludedFeatureId) {
		await autumn.post("/features.create", {
			feature_id: secondIncludedFeatureId,
			name: "AI Cascade Included 2",
			type: FeatureType.AiCreditSystem,
			model_markups: {
				[CASCADE_MODEL]: { markup: 0, input_cost: 5, output_cost: 15 },
			},
		});
	}
	await autumn.post("/features.create", {
		feature_id: overageFeatureId,
		name: "AI Cascade Overage",
		type: FeatureType.AiCreditSystem,
		model_markups: {
			[CASCADE_MODEL]: { markup: 50, input_cost: 5, output_cost: 15 },
		},
	});

	return { includedFeatureId, overageFeatureId, secondIncludedFeatureId };
};

/**
 * Builds a customer on a product carrying one included AI credit system, an
 * overage one, and optionally a second included one — the shape every cascade
 * scenario shares. Returns the scenario plus the throwaway feature ids.
 */
const setupCascade = async (
	id: string,
	{
		includedUsage,
		secondIncludedUsage,
		overageMaxPurchase,
		entityFeatureId,
		entityCount,
	}: {
		includedUsage: number;
		secondIncludedUsage?: number;
		overageMaxPurchase?: number;
		entityFeatureId?: TestFeature;
		entityCount?: number;
	},
) => {
	const { includedFeatureId, overageFeatureId, secondIncludedFeatureId } =
		await createCascadeFeatures({
			withSecondIncluded: secondIncludedUsage !== undefined,
		});

	const productItems = [
		items.free({
			featureId: includedFeatureId,
			includedUsage,
			entityFeatureId,
		}),
	];
	if (secondIncludedFeatureId && secondIncludedUsage !== undefined) {
		productItems.push(
			items.free({
				featureId: secondIncludedFeatureId,
				includedUsage: secondIncludedUsage,
				entityFeatureId,
			}),
		);
	}
	productItems.push(
		items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
			maxPurchase: overageMaxPurchase,
			entityFeatureId,
		}),
	);

	const proProduct = products.base({ id, items: productItems });

	const scenario = await initScenario({
		customerId: id,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [proProduct] }),
			...(entityCount && entityFeatureId
				? [s.entities({ count: entityCount, featureId: entityFeatureId })]
				: []),
		],
		actions: [s.attach({ productId: proProduct.id })],
	});

	return {
		...scenario,
		includedFeatureId,
		overageFeatureId,
		secondIncludedFeatureId,
	};
};

const trackCascadeModel = (
	autumn: { post: (path: string, body: unknown) => Promise<unknown> },
	customerId: string,
	{
		entityId,
		featureId,
		overageBehavior,
		skipCache,
	}: {
		entityId?: string;
		featureId?: string;
		overageBehavior?: "cap" | "reject";
		skipCache?: boolean;
	} = {},
): Promise<TrackResponseV3> =>
	autumn.post(skipCache ? "/track_tokens?skip_cache=true" : "/track_tokens", {
		customer_id: customerId,
		model_id: CASCADE_MODEL,
		input_tokens: 200000,
		output_tokens: 200000,
		...(entityId ? { entity_id: entityId } : {}),
		...(featureId ? { feature_id: featureId } : {}),
		...(overageBehavior ? { overage_behavior: overageBehavior } : {}),
	}) as Promise<TrackResponseV3>;

const deductionFor = (trackRes: TrackResponseV3, featureId: string) =>
	trackRes.deductions?.find((deduction) => deduction.feature_id === featureId);

const expectUsage = (
	customer: ApiCustomerV5 | ApiEntityV2,
	featureId: string,
	remaining: number,
	usage: number,
) => expectBalanceCorrect({ customer, featureId, remaining, usage });

// ═══════════════════════════════════════════════════════════════════
// CASCADE-1: included drains first, remainder spills at the overage markup.
// Run through both the Redis (cached) and Postgres (skip_cache fallback) paths
// since they are separate deduction engines that must settle identically.
// ═══════════════════════════════════════════════════════════════════

for (const path of ["redis", "postgres"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`track-tokens-cascade-1 (${path}): included drains first, remainder spills at the overage markup`)}`,
		async () => {
			const { customerId, autumnV2_2, includedFeatureId, overageFeatureId } =
				await setupCascade(`track-tokens-cascade-1-${path}`, {
					includedUsage: 2,
				});

			// base $4: included covers 2 of it (fraction 0.5); the remaining half of
			// the event charges the overage system at its own cost: 0.5 × $6 = $3.
			const trackRes = await trackCascadeModel(autumnV2_2, customerId, {
				skipCache: path === "postgres",
			});

			expect(trackRes.value).toBeCloseTo(4, 10);
			expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(
				2,
				10,
			);
			expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(
				3,
				10,
			);
			// Two systems were touched, so there is no single primary balance.
			expect(trackRes.balance).toBeNull();
			expect(Object.keys(trackRes.balances ?? {})).toEqual(
				expect.arrayContaining([includedFeatureId, overageFeatureId]),
			);

			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectUsage(customer, includedFeatureId, 0, 2);
			expectUsage(customer, overageFeatureId, 0, 3);
		},
	);
}

// ═══════════════════════════════════════════════════════════════════
// CASCADE-2: included covers the whole event, overage untouched
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-2: included covers the whole event, overage untouched")}`,
	async () => {
		const { customerId, autumnV2_2, includedFeatureId, overageFeatureId } =
			await setupCascade("track-tokens-cascade-2", { includedUsage: 10 });

		const trackRes = await trackCascadeModel(autumnV2_2, customerId);

		expect(trackRes.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, overageFeatureId)).toBeUndefined();

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectUsage(customer, includedFeatureId, 6, 4);
		expectUsage(customer, overageFeatureId, 0, 0);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-3: included already empty, full event charges overage at its markup
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-3: included already empty, full event charges overage at its markup")}`,
	async () => {
		const { customerId, autumnV2_2, includedFeatureId, overageFeatureId } =
			await setupCascade("track-tokens-cascade-3", { includedUsage: 0 });

		const trackRes = await trackCascadeModel(autumnV2_2, customerId);

		expect(deductionFor(trackRes, includedFeatureId)).toBeUndefined();
		expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(6, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectUsage(customer, includedFeatureId, 0, 0);
		expectUsage(customer, overageFeatureId, 0, 6);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-4: reject is all-or-nothing — the included deduction is restored
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-4: reject is all-or-nothing, included deduction restored")}`,
	async () => {
		// usage_limit 1 → at most $1 of overage; the $3 spill cannot fit
		const { customerId, autumnV2_2, includedFeatureId, overageFeatureId } =
			await setupCascade("track-tokens-cascade-4", {
				includedUsage: 2,
				overageMaxPurchase: 1,
			});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				trackCascadeModel(autumnV2_2, customerId, {
					overageBehavior: "reject",
				}),
		});

		// The included deduction already ran when the overage deduction
		// rejected; the compensation must have restored it exactly.
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectUsage(customer, includedFeatureId, 2, 0);
		expectUsage(customer, overageFeatureId, 0, 0);

		// Same track under "cap": included drains, overage clamps at its limit
		// and the uncovered remainder is discarded.
		const capRes = await trackCascadeModel(autumnV2_2, customerId);
		expect(deductionFor(capRes, includedFeatureId)?.value).toBeCloseTo(2, 10);
		expect(deductionFor(capRes, overageFeatureId)?.value).toBeCloseTo(1, 10);

		// Cached vs DB agreement, including the compensated reject attempt
		await timeout(6000);
		const customerNonCached = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectUsage(customerNonCached, includedFeatureId, 0, 2);
		expectUsage(customerNonCached, overageFeatureId, 0, 1);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-5: explicit feature_id bypasses the cascade
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-5: explicit feature_id bypasses the cascade")}`,
	async () => {
		const { customerId, autumnV2_2, includedFeatureId, overageFeatureId } =
			await setupCascade("track-tokens-cascade-5", { includedUsage: 10 });

		const trackRes = await trackCascadeModel(autumnV2_2, customerId, {
			featureId: overageFeatureId,
		});

		// Single-system behavior at the overage system's own markup
		expect(trackRes.value).toBeCloseTo(6, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectUsage(customer, includedFeatureId, 10, 0);
		expectUsage(customer, overageFeatureId, 0, 6);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-6: entity-scoped balances cascade within the target entity only
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-6: entity-scoped balances cascade within the target entity only")}`,
	async () => {
		const {
			customerId,
			autumnV2_2,
			entities,
			includedFeatureId,
			overageFeatureId,
		} = await setupCascade("track-tokens-cascade-6", {
			includedUsage: 2,
			entityFeatureId: TestFeature.Users,
			entityCount: 2,
		});

		await trackCascadeModel(autumnV2_2, customerId, {
			entityId: entities[0].id,
		});

		const entity0 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectUsage(entity0, includedFeatureId, 0, 2);
		expectUsage(entity0, overageFeatureId, 0, 3);

		const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		expectUsage(entity1, includedFeatureId, 2, 0);
		expectUsage(entity1, overageFeatureId, 0, 0);
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-7: three systems cascade — both included pools drain before overage
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("track-tokens-cascade-7: two included systems drain before overage, no feature_id")}`,
	async () => {
		// base $4. The two included pools hold 2 + 1 = 3 and both drain fully; the
		// leftover quarter of the event spills into overage at its own markup:
		// 0.25 × $6 = $1.5.
		const {
			customerId,
			autumnV2_2,
			includedFeatureId,
			overageFeatureId,
			secondIncludedFeatureId,
		} = await setupCascade("track-tokens-cascade-7", {
			includedUsage: 2,
			secondIncludedUsage: 1,
		});

		const trackRes = await trackCascadeModel(autumnV2_2, customerId);

		expect(trackRes.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(2, 10);
		expect(
			secondIncludedFeatureId
				? deductionFor(trackRes, secondIncludedFeatureId)?.value
				: undefined,
		).toBeCloseTo(1, 10);
		expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(
			1.5,
			10,
		);
		// Three systems were touched, so there is no single primary balance.
		expect(trackRes.balance).toBeNull();

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectUsage(customer, includedFeatureId, 0, 2);
		if (secondIncludedFeatureId) {
			expectUsage(customer, secondIncludedFeatureId, 0, 1);
		}
		expectUsage(customer, overageFeatureId, 0, 1.5);
	},
);
