/**
 * invoices.create — seeded fuzz of plan customization (preview + a few live invoices).
 *
 * Each seed builds a catalog plan and an invoice request that overrides prices,
 * prices features the plan lacks, switches billing methods, and varies tiers,
 * billing units, quantities and proration. An independent oracle
 * (utils/fuzz/invoiceOracle.ts) predicts every line; the catalog must be
 * untouched and invalid requests must be a 400, never a 500.
 *
 * Reproduce one case: the seed is in the test name; run with -t "seed=<n> ".
 */

import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	catalogPricingSnapshot,
	expectInvoiceMatchesOracle,
	expectStripeInvoiceMatchesPreview,
	postInvoiceCreate,
} from "./utils/fuzz/expectInvoiceMatchesOracle";
import {
	catalogToProductItems,
	type FuzzScenario,
	generateCustomizeScenario,
} from "./utils/fuzz/generateCustomizeScenario";

const CUSTOMER_ID = "inv-create-customize-fuzz";

const PREVIEW_SEEDS = Array.from({ length: 40 }, (_, index) => 1001 + index);
const LIVE_SEEDS = [7001, 7002, 7003, 7004];

const generateLiveScenario = (seed: number): FuzzScenario => {
	for (let attempt = 0; ; attempt++) {
		const scenario = generateCustomizeScenario({
			seed: seed * 100 + attempt,
			allowInvalid: false,
		});
		if (scenario.expected.kind === "lines")
			return { ...scenario, productId: `fuzz-live-${seed}` };
	}
};

const previewScenarios = PREVIEW_SEEDS.map((seed) =>
	generateCustomizeScenario({
		seed,
		allowInvalid: true,
	}),
);
const liveScenarios = LIVE_SEEDS.map(generateLiveScenario);

const scenarioProduct = (scenario: FuzzScenario): ProductV2 =>
	products.base({
		id: scenario.productId,
		items: catalogToProductItems(scenario.catalog),
	});

let setupPromise: ReturnType<typeof runSetup> | undefined;
const runSetup = async () => {
	const catalogProducts = [...previewScenarios, ...liveScenarios].map(
		(scenario) => [scenario.productId, scenarioProduct(scenario)] as const,
	);
	const result = await initScenario({
		customerId: CUSTOMER_ID,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: catalogProducts.map(([, product]) => product) }),
		],
		actions: [],
	});
	// initScenario prefixes product ids with the customer id.
	const planIds = new Map(
		catalogProducts.map(([key, product]) => [key, product.id]),
	);
	return { ...result, planIds };
};
const sharedSetup = () => {
	setupPromise ??= runSetup();
	return setupPromise;
};

const runScenario = async ({
	scenario,
	preview,
}: {
	scenario: FuzzScenario;
	preview: boolean;
}) => {
	const { ctx, autumnV2_3, planIds } = await sharedSetup();
	const planId = planIds.get(scenario.productId) as string;
	const catalogBefore = await catalogPricingSnapshot({
		ctx,
		productId: planId,
	});

	const outcome = await postInvoiceCreate({
		autumnV2_3,
		params: {
			customer_id: CUSTOMER_ID,
			plans: [{ plan_id: planId, ...scenario.plan }],
			...(scenario.period
				? {
						period_start: scenario.period.start,
						period_end: scenario.period.end,
					}
				: {}),
			preview,
		},
	});

	expectInvoiceMatchesOracle({ outcome, expected: scenario.expected });
	expect(await catalogPricingSnapshot({ ctx, productId: planId })).toEqual(
		catalogBefore,
	);
	return { ctx, outcome };
};

for (const scenario of previewScenarios) {
	test.concurrent(
		`${chalk.yellowBright(`invoices.create customize fuzz: seed=${scenario.seed} `)}${scenario.summary}`,
		async () => {
			await runScenario({ scenario, preview: true });
		},
	);
}

for (const scenario of liveScenarios) {
	test.concurrent(
		`${chalk.yellowBright(`invoices.create customize fuzz (live): seed=${scenario.seed} `)}${scenario.summary}`,
		async () => {
			const { ctx, outcome } = await runScenario({ scenario, preview: false });
			if (!outcome.ok) return;
			await expectStripeInvoiceMatchesPreview({
				ctx,
				response: outcome.response,
			});
		},
	);
}
