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

const createCascadeFeatures = async () => {
	const autumn = new AutumnInt({ version: ApiVersion.V2_2 });
	const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const includedFeatureId = `ai_cascade_inc_${suffix}`;
	const overageFeatureId = `ai_cascade_ovg_${suffix}`;

	await autumn.post("/features.create", {
		feature_id: includedFeatureId,
		name: "AI Cascade Included",
		type: FeatureType.AiCreditSystem,
		model_markups: {
			[CASCADE_MODEL]: { markup: 0, input_cost: 5, output_cost: 15 },
		},
	});
	await autumn.post("/features.create", {
		feature_id: overageFeatureId,
		name: "AI Cascade Overage",
		type: FeatureType.AiCreditSystem,
		model_markups: {
			[CASCADE_MODEL]: { markup: 50, input_cost: 5, output_cost: 15 },
		},
	});

	return { includedFeatureId, overageFeatureId };
};

const deductionFor = (trackRes: TrackResponseV3, featureId: string) =>
	trackRes.deductions?.find((deduction) => deduction.feature_id === featureId);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-1: included drains first, remainder spills at the overage markup
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-1: included drains first, remainder spills at the overage markup")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 2,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.base({
			id: "cascade-1",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		// base $4: included covers 2 of it (fraction 0.5); the remaining half of
		// the event charges the overage system at its own cost: 0.5 × $6 = $3.
		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		expect(trackRes.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(2, 10);
		expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(3, 10);
		// Two systems were touched, so there is no single primary balance.
		expect(trackRes.balance).toBeNull();
		expect(Object.keys(trackRes.balances ?? {})).toEqual(
			expect.arrayContaining([includedFeatureId, overageFeatureId]),
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 2,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 3,
		});

		// Cached vs DB agreement (mutation-log sync is async)
		await timeout(6000);
		const customerNonCached = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerNonCached,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 2,
		});
		expectBalanceCorrect({
			customer: customerNonCached,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 3,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-2: included covers the whole event, overage untouched
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-2: included covers the whole event, overage untouched")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 10,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.base({
			id: "cascade-2",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-2",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		expect(trackRes.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, overageFeatureId)).toBeUndefined();

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 6,
			usage: 4,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-3: included already empty, full event charges overage at its markup
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-3: included already empty, full event charges overage at its markup")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 0,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.base({
			id: "cascade-3",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-3",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		expect(deductionFor(trackRes, includedFeatureId)).toBeUndefined();
		expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(6, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 0,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 6,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-4: reject is all-or-nothing — the included deduction is restored
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-4: reject is all-or-nothing, included deduction restored")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 2,
		});
		// usage_limit 1 → at most $1 of overage; the $3 spill cannot fit
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
			maxPurchase: 1,
		});
		const proProduct = products.base({
			id: "cascade-4",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-4",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_2.post("/track_tokens", {
					customer_id: customerId,
					model_id: CASCADE_MODEL,
					input_tokens: 200000,
					output_tokens: 200000,
					overage_behavior: "reject",
				}),
		});

		// The included deduction already ran when the overage deduction
		// rejected; the compensation must have restored it exactly.
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 2,
			usage: 0,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 0,
		});

		// Same track under "cap": included drains, overage clamps at its limit
		// and the uncovered remainder is discarded.
		const capRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});
		expect(deductionFor(capRes, includedFeatureId)?.value).toBeCloseTo(2, 10);
		expect(deductionFor(capRes, overageFeatureId)?.value).toBeCloseTo(1, 10);

		// Cached vs DB agreement, including the compensated reject attempt
		await timeout(6000);
		const customerNonCached = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerNonCached,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 2,
		});
		expectBalanceCorrect({
			customer: customerNonCached,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 1,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-5: explicit feature_id bypasses the cascade
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-5: explicit feature_id bypasses the cascade")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 10,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.base({
			id: "cascade-5",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-5",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			feature_id: overageFeatureId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		// Single-system behavior at the overage system's own markup
		expect(trackRes.value).toBeCloseTo(6, 10);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 10,
			usage: 0,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 6,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-6: entity-scoped balances cascade within the target entity only
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-6: entity-scoped balances cascade within the target entity only")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();
		const includedItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 2,
			entityFeatureId: TestFeature.Users,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
			entityFeatureId: TestFeature.Users,
		});
		const proProduct = products.base({
			id: "cascade-6",
			items: [includedItem, overageItem],
		});

		const { customerId, autumnV2_2, entities } = await initScenario({
			customerId: "track-tokens-cascade-6",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			entity_id: entities[0].id,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		const entity0 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectBalanceCorrect({
			customer: entity0,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 2,
		});
		expectBalanceCorrect({
			customer: entity0,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 3,
		});

		const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		expectBalanceCorrect({
			customer: entity1,
			featureId: includedFeatureId,
			remaining: 2,
			usage: 0,
		});
		expectBalanceCorrect({
			customer: entity1,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 0,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// CASCADE-7: three systems cascade — both included pools drain before overage
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("track-tokens-cascade-7: two included systems drain before overage, no feature_id")}`,
	async () => {
		const { includedFeatureId, overageFeatureId } =
			await createCascadeFeatures();

		// A second included (0% markup) system on the same model.
		const autumn = new AutumnInt({ version: ApiVersion.V2_2 });
		const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const secondIncludedFeatureId = `ai_cascade_inc2_${suffix}`;
		await autumn.post("/features.create", {
			feature_id: secondIncludedFeatureId,
			name: "AI Cascade Included 2",
			type: FeatureType.AiCreditSystem,
			model_markups: {
				[CASCADE_MODEL]: { markup: 0, input_cost: 5, output_cost: 15 },
			},
		});

		// base $4. The two included pools hold 2 + 1 = 3 and both drain fully; the
		// leftover quarter of the event spills into overage at its own markup:
		// 0.25 × $6 = $1.5.
		const includedAItem = items.free({
			featureId: includedFeatureId,
			includedUsage: 2,
		});
		const includedBItem = items.free({
			featureId: secondIncludedFeatureId,
			includedUsage: 1,
		});
		const overageItem = items.consumable({
			featureId: overageFeatureId,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		});
		const proProduct = products.base({
			id: "cascade-7",
			items: [includedAItem, includedBItem, overageItem],
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "track-tokens-cascade-7",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [proProduct] }),
			],
			actions: [s.attach({ productId: proProduct.id })],
		});

		const trackRes: TrackResponseV3 = await autumnV2_2.post("/track_tokens", {
			customer_id: customerId,
			model_id: CASCADE_MODEL,
			input_tokens: 200000,
			output_tokens: 200000,
		});

		expect(trackRes.value).toBeCloseTo(4, 10);
		expect(deductionFor(trackRes, includedFeatureId)?.value).toBeCloseTo(2, 10);
		expect(deductionFor(trackRes, secondIncludedFeatureId)?.value).toBeCloseTo(
			1,
			10,
		);
		expect(deductionFor(trackRes, overageFeatureId)?.value).toBeCloseTo(1.5, 10);
		// Three systems were touched, so there is no single primary balance.
		expect(trackRes.balance).toBeNull();

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: includedFeatureId,
			remaining: 0,
			usage: 2,
		});
		expectBalanceCorrect({
			customer,
			featureId: secondIncludedFeatureId,
			remaining: 0,
			usage: 1,
		});
		expectBalanceCorrect({
			customer,
			featureId: overageFeatureId,
			remaining: 0,
			usage: 1.5,
		});
	},
);
