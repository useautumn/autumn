import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

const ACTION1_CREDIT_COST = 0.2;

const EVENT_INGEST_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 3_000;

type DeductionBalance = {
	balance_id: string;
	entity_id: string | null;
	plan_id: string | null;
	reset: { interval: string; resets_at: number | null } | null;
	credit_cost: number | null;
	deducted: number;
	events: number;
};

type DeductionFeature = {
	feature_type: "metered" | "credit_system";
	deducted: number;
	events: number;
	balances: DeductionBalance[];
};

type DeductionPeriod = {
	period: number;
	values: Record<string, DeductionFeature>;
	grouped_values?: Record<
		string,
		Record<string, { deducted: number; credit_cost?: number | null }>
	>;
};

type AggregateResponse = {
	list: {
		period: number;
		values: Record<string, number>;
		grouped_values?: Record<string, Record<string, number>>;
	}[];
	total: Record<string, { count: number; sum: number }>;
	deductions?: DeductionPeriod[];
};

const sumDeducted = (response: AggregateResponse, featureId: string): number =>
	(response.deductions ?? []).reduce(
		(sum, period) => sum + (period.values[featureId]?.deducted ?? 0),
		0,
	);

const findFeature = (
	response: AggregateResponse,
	featureId: string,
): DeductionFeature | undefined =>
	(response.deductions ?? []).find((p) => p.values[featureId])?.values[
		featureId
	];

const pollUntilDeducted = async ({
	fetchResponse,
	featureId,
	expected,
}: {
	fetchResponse: () => Promise<AggregateResponse>;
	featureId: string;
	expected: number;
}): Promise<AggregateResponse> => {
	const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
	let response: AggregateResponse;
	do {
		await timeout(POLL_INTERVAL_MS);
		response = await fetchResponse();
	} while (
		Date.now() < deadline &&
		Math.abs(sumDeducted(response, featureId) - expected) > 0.0001
	);
	return response;
};

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: a feature past its allowance splits across its own balance and the credit pool")}`,
	async () => {
		const customerId = `agg-deductions-spill-${Date.now()}`;
		const ACTION1_ALLOWANCE = 10;
		const TRACKED = 25;
		const OVERFLOW = TRACKED - ACTION1_ALLOWANCE;
		const EXPECTED_CREDITS = OVERFLOW * ACTION1_CREDIT_COST;

		const prod = products.base({
			id: "spill",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Action1,
					includedUsage: ACTION1_ALLOWANCE,
				}),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: TRACKED,
			properties: { region: "us-east" },
		});

		const response = await pollUntilDeducted({
			featureId: TestFeature.Credits,
			expected: EXPECTED_CREDITS,
			fetchResponse: async () =>
				(await autumnV2_2.events.aggregate({
					customer_id: customerId,
					feature_id: TestFeature.Action1,
					aggregate_on: "deducted",
					range: "7d",
				})) as AggregateResponse,
		});

		expect(response.deductions).toBeDefined();
		expect(Array.isArray(response.deductions)).toBe(true);
		expect(response.deductions?.length).toBeGreaterThan(0);

		expect(response.total[TestFeature.Action1]?.sum).toBe(TRACKED);
		expect(response.list.length).toBeGreaterThan(0);

		const ownMeter = findFeature(response, TestFeature.Action1);
		const creditPool = findFeature(response, TestFeature.Credits);

		expect(ownMeter, "own metered balance missing from values{}").toBeDefined();
		expect(creditPool, "credit system missing from values{}").toBeDefined();

		expect(ownMeter?.feature_type).toBe("metered");
		expect(creditPool?.feature_type).toBe("credit_system");

		expect(ownMeter?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditPool?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);

		expect(ownMeter?.events).toBe(1);
		expect(creditPool?.events).toBe(1);

		const meterBalance = ownMeter?.balances?.[0];
		const creditBalance = creditPool?.balances?.[0];

		expect(ownMeter?.balances).toHaveLength(1);
		expect(creditPool?.balances).toHaveLength(1);

		expect(typeof meterBalance?.balance_id).toBe("string");
		expect(meterBalance?.balance_id).toStartWith("cus_ent_");

		expect(meterBalance?.entity_id).toBeNull();
		expect(creditBalance?.entity_id).toBeNull();

		expect(meterBalance?.plan_id).toBe(prod.id);
		expect(creditBalance?.plan_id).toBe(prod.id);

		expect(meterBalance?.reset?.interval).toBe("month");
		expect(typeof meterBalance?.reset?.resets_at).toBe("number");

		expect(meterBalance?.credit_cost).toBeNull();
		expect(creditBalance?.credit_cost).toBeCloseTo(ACTION1_CREDIT_COST, 6);

		expect(meterBalance?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditBalance?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);

		expect(response.deductions?.[0]?.grouped_values).toBeUndefined();

		expect(typeof response.deductions?.[0]?.period).toBe("number");
		expect(response.deductions?.[0]?.period).toBeGreaterThan(1_600_000_000_000);

		const propertyGrouped = (await autumnV2_2.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			aggregate_on: "deducted",
			group_by: "properties.region",
			range: "7d",
		})) as AggregateResponse;

		const propertyMeter = findFeature(propertyGrouped, TestFeature.Action1);
		const propertyCredit = findFeature(propertyGrouped, TestFeature.Credits);
		expect(
			propertyMeter,
			"metered balance missing under property grouping",
		).toBeDefined();
		expect(
			propertyCredit,
			"credit balance missing under property grouping",
		).toBeDefined();

		const splitFor = (balanceId?: string) =>
			(propertyGrouped.deductions ?? [])
				.map((period) => period.grouped_values?.[balanceId ?? ""])
				.find(Boolean);

		const meterSplit = splitFor(propertyMeter?.balances?.[0]?.balance_id);
		const creditSplit = splitFor(propertyCredit?.balances?.[0]?.balance_id);

		expect(meterSplit?.["us-east"]?.deducted).toBe(ACTION1_ALLOWANCE);
		expect(creditSplit?.["us-east"]?.deducted).toBeCloseTo(EXPECTED_CREDITS, 6);

		const featureGrouped = (await autumnV2_2.events.aggregate({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			aggregate_on: "deducted",
			group_by: "$feature_id",
			range: "7d",
		})) as AggregateResponse;

		const featureCredit = findFeature(featureGrouped, TestFeature.Credits);
		const featureSplit = (featureGrouped.deductions ?? [])
			.map(
				(period) =>
					period.grouped_values?.[
						featureCredit?.balances?.[0]?.balance_id ?? ""
					],
			)
			.find(Boolean);

		expect(featureSplit?.[TestFeature.Action1]?.deducted).toBeCloseTo(
			EXPECTED_CREDITS,
			6,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: group_by $entity_id splits a shared balance by which entity spent")}`,
	async () => {
		const customerId = `agg-deductions-entity-${Date.now()}`;
		const ENT_1_TRACKED = 5;
		const ENT_2_TRACKED = 10;
		const ENT_1_CREDITS = ENT_1_TRACKED * ACTION1_CREDIT_COST;
		const ENT_2_CREDITS = ENT_2_TRACKED * ACTION1_CREDIT_COST;
		const prod = products.base({
			id: "shared-pool",
			items: [
				items.monthlyUsers({ includedUsage: 5 }),
				items.monthlyCredits({ includedUsage: 100 }),
			],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Action1,
			value: ENT_1_TRACKED,
		});
		await autumnV1.track({
			customer_id: customerId,
			entity_id: "ent-2",
			feature_id: TestFeature.Action1,
			value: ENT_2_TRACKED,
		});

		const response = await pollUntilDeducted({
			featureId: TestFeature.Credits,
			expected: ENT_1_CREDITS + ENT_2_CREDITS,
			fetchResponse: async () =>
				(await autumnV2_2.events.aggregate({
					customer_id: customerId,
					feature_id: TestFeature.Credits,
					aggregate_on: "deducted",
					group_by: "$entity_id",
					range: "7d",
				})) as AggregateResponse,
		});

		const creditPool = findFeature(response, TestFeature.Credits);
		expect(creditPool, "credit system missing from values{}").toBeDefined();

		expect(creditPool?.balances).toHaveLength(1);
		const sharedBalance = creditPool?.balances?.[0];
		expect(sharedBalance?.entity_id).toBeNull();
		expect(creditPool?.deducted).toBeCloseTo(ENT_1_CREDITS + ENT_2_CREDITS, 6);
		expect(creditPool?.events).toBe(2);

		const period = response.deductions?.find(
			(p) => p.grouped_values?.[sharedBalance?.balance_id ?? ""],
		);
		expect(
			period,
			"no period carries grouped_values for the shared balance",
		).toBeDefined();

		const split = period?.grouped_values?.[sharedBalance?.balance_id ?? ""];
		expect(split).toBeDefined();

		expect(split?.["ent-1"]?.deducted).toBeCloseTo(ENT_1_CREDITS, 6);
		expect(split?.["ent-2"]?.deducted).toBeCloseTo(ENT_2_CREDITS, 6);
	},
);

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: aggregate_on without customer_id is rejected 400")}`,
	async () => {
		const customerId = `agg-deductions-validation-${Date.now()}`;
		const prod = products.base({
			id: "validation",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		let threw = false;
		let code: string | undefined;
		let message: string | undefined;
		try {
			await autumnV2_2.events.aggregate({
				feature_id: TestFeature.Credits,
				aggregate_on: "deducted",
				range: "7d",
			});
		} catch (error) {
			threw = true;
			const e = error as { code?: string; message?: string };
			code = e.code;
			message = e.message;
		}

		expect(threw, "aggregate_on without customer_id should be rejected").toBe(
			true,
		);
		expect(code).toBe("invalid_request");
		expect(message).toContain("customer_id is required");
	},
);

test.concurrent(
	`${chalk.yellowBright("aggregate deductions: omitting aggregate_on returns no deductions key at all")}`,
	async () => {
		const customerId = `agg-deductions-additive-${Date.now()}`;
		const TRACKED = 7;

		const prod = products.base({
			id: "additive",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [prod], prefix: customerId }),
			],
			actions: [s.attach({ productId: prod.id })],
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: TRACKED,
		});

		const deadline = Date.now() + EVENT_INGEST_TIMEOUT_MS;
		let response: AggregateResponse;
		do {
			await timeout(POLL_INTERVAL_MS);
			response = (await autumnV2_2.events.aggregate({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				range: "7d",
			})) as AggregateResponse;
		} while (
			Date.now() < deadline &&
			(response.total[TestFeature.Action1]?.sum ?? 0) !== TRACKED
		);

		expect(response.deductions).toBeUndefined();

		expect(response.total[TestFeature.Action1]?.sum).toBe(TRACKED);
		expect(response.list.length).toBeGreaterThan(0);
	},
);
