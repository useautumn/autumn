import { expect, test } from "bun:test";
import { getCustomerEvents } from "@tests/integration/balances/utils/events/getCustomerEvents.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

// A queued track_tokens event must record the same credit_cost as a synchronous one.
// Pre-fix: the queue message dropped the token cost, so the replayed event had no credit_cost.

const OVERFLOW_TO_ORBS = { [TestFeature.Orbs]: 20_000 };

const trackOverflowingTokens = async ({
	customerId,
	select,
}: {
	customerId: string;
	select: (clients: {
		autumnV2_4: AutumnInt;
		autumnV2_5: AutumnInt;
	}) => AutumnInt;
}) => {
	const freeProd = products.base({
		id: "free",
		items: [
			items.free({ featureId: TestFeature.AiCredits, includedUsage: 100 }),
			items.free({ featureId: TestFeature.Orbs, includedUsage: 50_000 }),
		],
	});
	const clients = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	// $120 of usage against a $100 AI balance: $20 overflows to orbs at 1000 per $1.
	await select(clients).post("/track_tokens", {
		customer_id: customerId,
		feature_id: TestFeature.AiCredits,
		model_id: "custom/internal-model",
		input_tokens: 24_000_000,
		output_tokens: 0,
	});
};

const savedCreditCost = ({ customerId }: { customerId: string }) =>
	pollUntilAsserted({
		fetch: () => getCustomerEvents({ customerId }),
		assert: (events) => expect(events).toHaveLength(1),
	}).then((events) => events[0].properties?.credit_cost);

test.concurrent(
	`${chalk.yellowBright("track-tokens-async-credit-cost: a queued track_tokens saves the same credit_cost as a sync one")}`,
	async () => {
		const syncCustomerId = "track-tokens-credit-cost-sync";
		const queuedCustomerId = "track-tokens-credit-cost-queued";

		await trackOverflowingTokens({
			customerId: syncCustomerId,
			select: ({ autumnV2_4 }) => autumnV2_4,
		});
		await trackOverflowingTokens({
			customerId: queuedCustomerId,
			select: ({ autumnV2_5 }) => autumnV2_5,
		});

		expect(await savedCreditCost({ customerId: syncCustomerId })).toEqual(
			OVERFLOW_TO_ORBS,
		);
		expect(await savedCreditCost({ customerId: queuedCustomerId })).toEqual(
			OVERFLOW_TO_ORBS,
		);
	},
);
