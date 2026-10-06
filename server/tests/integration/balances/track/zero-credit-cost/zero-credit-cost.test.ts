/**
 * Contract: a metered feature its credit system prices at 0 credits is free.
 * Tracking it, checking it, and locking + finalizing it never moves the credit
 * balance — on the Redis path and on the Postgres path (skip_cache) alike —
 * and an empty credit balance never blocks it.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, FeatureConfigOverride } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const freeAction1: FeatureConfigOverride = {
	schema: [
		{ metered_feature_id: TestFeature.Action1, credit_amount: 0 },
		{ metered_feature_id: TestFeature.Action2, credit_amount: 5 },
	],
};

const makeCreditsProd = ({ includedUsage }: { includedUsage: number }) => {
	const creditsItem = items.free({
		featureId: TestFeature.Credits,
		includedUsage,
	});
	return products.base({
		id: "free",
		items: [
			{
				...creditsItem,
				config: { ...creditsItem.config, feature_override: freeAction1 },
			},
		],
	});
};

const setup = async ({
	customerId,
	includedUsage = 100,
}: {
	customerId: string;
	includedUsage?: number;
}) => {
	const freeProd = makeCreditsProd({ includedUsage });
	return initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});
};

const expectCredits = async ({
	autumnV1,
	customerId,
	balance,
}: {
	autumnV1: Awaited<ReturnType<typeof setup>>["autumnV1"];
	customerId: string;
	balance: number;
}) => {
	const cached = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(cached.features[TestFeature.Credits]).toMatchObject({ balance });

	await timeout(2000);
	const persisted = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		skip_cache: "true",
	});
	expect(persisted.features[TestFeature.Credits]).toMatchObject({ balance });
};

for (const skipCache of [false, true]) {
	const path = skipCache ? "postgres" : "redis";

	test.concurrent(
		`${chalk.yellowBright(`zero credit cost (${path}): track leaves credits untouched`)}`,
		async () => {
			const customerId = `zero-credit-track-${path}`;
			const { autumnV1 } = await setup({ customerId });

			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Action1,
				value: 3,
				...(skipCache && { skip_cache: true }),
			});

			await expectCredits({ autumnV1, customerId, balance: 100 });
		},
		{ timeout: 120_000 },
	);

	test.concurrent(
		`${chalk.yellowBright(`zero credit cost (${path}): check + lock + finalize never move credits`)}`,
		async () => {
			const customerId = `zero-credit-lock-${path}`;
			const { autumnV1, autumnV2_1, ctx } = await setup({ customerId });

			for (const [index, finalize] of [
				{ action: "confirm" as const, override_value: 3 },
				{ action: "release" as const },
			].entries()) {
				const lockId = `${customerId}-${index}`;
				await deleteLock({ ctx, lockId });

				const check = await autumnV2_1.check({
					customer_id: customerId,
					feature_id: TestFeature.Action1,
					required_balance: 1,
					lock: { enabled: true, lock_id: lockId },
					...(skipCache && { skip_cache: true }),
				});
				expect(check.allowed).toBe(true);

				await autumnV2_1.balances.finalize(
					{ lock_id: lockId, ...finalize },
					...(skipCache ? [{ skipCache: true }] : []),
				);
			}

			await expectCredits({ autumnV1, customerId, balance: 100 });
		},
		{ timeout: 120_000 },
	);
}

test.concurrent(
	`${chalk.yellowBright("zero credit cost: an empty credit balance never blocks a free feature")}`,
	async () => {
		const customerId = "zero-credit-empty";
		const { autumnV1, autumnV2_1 } = await setup({
			customerId,
			includedUsage: 0,
		});

		const check = await autumnV2_1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});
		expect(check.allowed).toBe(true);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 2,
			overage_behavior: "reject",
		});

		await expectCredits({ autumnV1, customerId, balance: 0 });
	},
	{ timeout: 120_000 },
);

test.concurrent(
	`${chalk.yellowBright("zero credit cost: a priced sibling still pays its rate (control)")}`,
	async () => {
		const customerId = "zero-credit-control";
		const { autumnV1 } = await setup({ customerId });

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 2,
		});

		await expectCredits({ autumnV1, customerId, balance: 90 });
	},
	{ timeout: 120_000 },
);
