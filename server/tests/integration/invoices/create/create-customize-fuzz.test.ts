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
	type InvalidMutation,
} from "./utils/fuzz/generateCustomizeScenario";

const CUSTOMER_ID = "inv-create-customize-fuzz";

const PREVIEW_SEEDS = Array.from({ length: 40 }, (_, index) => 1001 + index);
const LIVE_SEEDS = [7001, 7002, 7003, 7004];

/** Mutations with an open bug (see test.todo below); generating them would only re-find it. */
const KNOWN_BUG_MUTATIONS: InvalidMutation[] = [
	"negative_item_amount",
	"zero_billing_units",
	"negative_tier_amount",
	"amount_and_tiers",
	"flat_amount_on_graduated",
	"volume_usage_based",
];

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
		excludedMutations: KNOWN_BUG_MUTATIONS,
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

// Known bugs. Repros: preview on a $20/mo plan with prepaid users ($10/seat) and volume
// prepaid messages ([500 @ $10, inf @ $5] per 100); prices are monthly, billing_units 1.

// Expected 400. Actual 200: users { amount: -2 }, quantity 5 → a -$10 line; a live invoice
// gets a -$10 Stripe line. Same on a feature the plan lacks.
test.todo(
	"invoices.create customize: negative customize.items price.amount is a 400",
	() => {},
);

// Expected 400. Actual 500 "amount: must be a number (received NaN)" for users { amount: 2, billing_units: 0 },
// quantity 5. On a feature the plan lacks, billing_units 0 is silently billed as 1.
test.todo(
	"invoices.create customize: billing_units 0 or negative is a 400, never a 500",
	() => {},
);

// Expected 400. Actual 200: billing_units: -10 on users drops the line (amount 0).
test.todo(
	"invoices.create customize: negative billing_units is a 400",
	() => {},
);

// Expected 400. Actual 200: storage tiers [{to:10,amount:1},{to:"inf",amount:-1}], quantity 20 → $0, line dropped.
test.todo(
	"invoices.create customize: negative tier amounts are a 400",
	() => {},
);

// Expected 400. Actual 200: amount 2 plus tiers bills one and ignores the other
// (tiers on a plan feature, the amount on a feature the plan lacks).
test.todo(
	"invoices.create customize: amount and tiers together are a 400",
	() => {},
);

// Expected 400. Actual 200: a price without amount or tiers (or tiers: []) silently bills $0,
// on users (plan feature) and storage (feature the plan lacks) alike.
test.todo(
	"invoices.create customize: a price with neither amount nor non-empty tiers is a 400",
	() => {},
);

// Expected 400. Actual 200: users graduated [{to:10,amount:1,flat_amount:50},{to:"inf",amount:0.5,flat_amount:50}],
// quantity 5 → $5; flat_amount silently ignored.
test.todo(
	"invoices.create customize: flat_amount on graduated tiers is a 400",
	() => {},
);

// Expected 400. Actual 200: storage [{to:100,amount:1}] (no "inf"), 200 units → $100, last 100 free;
// unsorted [{to:100,amount:1},{to:50,amount:2},{to:"inf",amount:3}] → $450.
test.todo(
	"invoices.create customize: tiers must ascend and end with to: inf",
	() => {},
);

// Expected 400 (catalog rejects volume on usage_based). Actual 200: words usage_based volume tiers billed.
test.todo(
	"invoices.create customize: volume tier_behavior on a usage_based price is a 400",
	() => {},
);

// Expected 400 as when the plan has no prepaid users price. Actual 200 $12: users
// { billing_method: "usage_based", amount: 3 } prices a prepaid users line of quantity 4.
test.todo(
	"invoices.create customize: an override whose billing_method differs from billing_behavior never prices that line",
	() => {},
);

// Expected one result. Actual: tiers [{to:500,amount:10},{to:"inf",amount:5}] per 100, no tier_behavior, 700 units
// → $35 on messages (inherits catalog volume) but $60 on storage (graduated).
test.todo(
	"invoices.create customize: omitted tier_behavior means the same thing with or without a catalog price",
	() => {},
);

// Expected whole-cent lines matching Stripe. Actual (live): three $0.335 lines preview 0.335 each,
// subtotal 1.01, total 1.02, discount_total -0.02 with no discount; Stripe bills 34¢ each.
test.todo(
	"invoices.create customize: sub-cent line amounts preview the cents Stripe bills",
	() => {},
);

// Expected 400 (ambiguous). Actual 200: two customize.items for users ($1 and $100); the first silently wins.
test.todo(
	"invoices.create customize: duplicate customize.items for one feature are a 400",
	() => {},
);

// Expected prorated: false. Actual: users { interval: "one_off" } with a period and prorate true
// bills the full $10 but reports prorated: true.
test.todo(
	"invoices.create customize: a one-off customized line is never reported as prorated",
	() => {},
);
