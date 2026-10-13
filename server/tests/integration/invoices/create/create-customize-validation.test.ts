/**
 * invoices.create — customize.items prices follow the catalog's pricing rules.
 *
 * Contract:
 *   - Prices that the catalog would refuse (amount+tiers, neither, flat_amount on
 *     graduated, volume on usage_based, tiers not ascending or not ending in inf,
 *     billing_units <= 0) are a 400, as are negative amounts and duplicate items.
 *   - The same rules apply to license_quantities[].customize.items.
 *   - An override only prices lines of its own billing_method.
 *   - Omitted tier_behavior is graduated, with or without a catalog price.
 *   - Preview lines and totals are the whole cents Stripe bills.
 *   - A one-off line is never reported as prorated.
 *   - Negative custom_line_items stay allowed (credits).
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type CreateInvoiceParamsInput,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem";
import {
	expectStripeInvoiceMatchesPreview,
	postInvoiceCreate,
} from "./utils/fuzz/expectInvoiceMatchesOracle";

type PlanParams = NonNullable<CreateInvoiceParamsInput["plans"]>[number];
type ItemPrice = NonNullable<
	NonNullable<NonNullable<PlanParams["customize"]>["items"]>[number]["price"]
>;

const customerId = "inv-create-customize-validation";
const plan = products.base({
	id: "customize-validation",
	items: [
		items.monthlyPrice({ price: 20 }),
		items.prepaidUsers({ billingUnits: 1 }),
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf", amount: 5 },
			],
			tierBehaviour: TierBehavior.VolumeBased,
			billingUnits: 100,
		}),
	],
});

const runSetup = () =>
	initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [plan] }),
		],
		actions: [],
	});
let setupPromise: ReturnType<typeof runSetup> | undefined;
const sharedSetup = () => {
	setupPromise ??= runSetup();
	return setupPromise;
};

const invoice = async ({
	plan: planParams,
	preview = true,
	extra = {},
}: {
	plan: Omit<PlanParams, "plan_id">;
	preview?: boolean;
	extra?: Partial<CreateInvoiceParamsInput>;
}) => {
	const { autumnV2_3, ctx } = await sharedSetup();
	const outcome = await postInvoiceCreate({
		autumnV2_3,
		params: {
			customer_id: customerId,
			plans: [{ plan_id: plan.id, ...planParams }],
			preview,
			...extra,
		},
	});
	return { ctx, outcome };
};

const prepaid = (overrides: Partial<ItemPrice>): ItemPrice => ({
	billing_method: BillingMethod.Prepaid,
	interval: BillingInterval.Month,
	billing_units: 1,
	amount: 2,
	...overrides,
});

const billed = (featureId: string, quantity: number) => ({
	feature_id: featureId,
	billing_behavior: BillingMethod.Prepaid,
	quantity,
	prorate: false,
});

const customizedLine = ({
	featureId,
	price,
	quantity = 5,
}: {
	featureId: string;
	price: ItemPrice;
	quantity?: number;
}): Omit<PlanParams, "plan_id"> => ({
	customize: { items: [{ feature_id: featureId, price }] },
	feature_quantities: [billed(featureId, quantity)],
});

const graduatedTiers = (tiers: ItemPrice["tiers"]) =>
	prepaid({ amount: undefined, tier_behavior: TierBehavior.Graduated, tiers });

const invalidRequests: [string, Omit<PlanParams, "plan_id">][] = [
	[
		"negative amount on a plan feature",
		customizedLine({
			featureId: TestFeature.Users,
			price: prepaid({ amount: -2 }),
		}),
	],
	[
		"negative amount on a feature the plan lacks",
		customizedLine({
			featureId: TestFeature.Storage,
			price: prepaid({ amount: -2 }),
		}),
	],
	[
		"negative tier amount",
		customizedLine({
			featureId: TestFeature.Storage,
			price: graduatedTiers([
				{ to: 10, amount: 1 },
				{ to: "inf", amount: -1 },
			]),
			quantity: 20,
		}),
	],
	[
		"negative flat_amount on a volume tier",
		customizedLine({
			featureId: TestFeature.Storage,
			price: prepaid({
				amount: undefined,
				tier_behavior: TierBehavior.VolumeBased,
				tiers: [
					{ to: 10, amount: 1, flat_amount: -50 },
					{ to: "inf", amount: 1 },
				],
			}),
			quantity: 5,
		}),
	],
	[
		"negative additional currency amount on a tier",
		customizedLine({
			featureId: TestFeature.Storage,
			price: graduatedTiers([
				{
					to: 10,
					amount: 1,
					additional_currencies: [{ currency: "eur", amount: -1 }],
				},
				{
					to: "inf",
					amount: 1,
					additional_currencies: [{ currency: "eur", amount: 1 }],
				},
			]),
			quantity: 5,
		}),
	],
	[
		"billing_units 0 on a plan feature",
		customizedLine({
			featureId: TestFeature.Users,
			price: prepaid({ billing_units: 0 }),
		}),
	],
	[
		"billing_units 0 on a feature the plan lacks",
		customizedLine({
			featureId: TestFeature.Storage,
			price: prepaid({ billing_units: 0 }),
		}),
	],
	[
		"negative billing_units",
		customizedLine({
			featureId: TestFeature.Users,
			price: prepaid({ billing_units: -10 }),
		}),
	],
	[
		"amount and tiers together",
		customizedLine({
			featureId: TestFeature.Users,
			price: prepaid({
				tier_behavior: TierBehavior.Graduated,
				tiers: [
					{ to: 10, amount: 1 },
					{ to: "inf", amount: 0.5 },
				],
			}),
		}),
	],
	[
		"neither amount nor tiers",
		customizedLine({
			featureId: TestFeature.Users,
			price: prepaid({ amount: undefined }),
		}),
	],
	[
		"empty tiers",
		customizedLine({
			featureId: TestFeature.Storage,
			price: prepaid({ amount: undefined, tiers: [] }),
		}),
	],
	[
		"flat_amount on graduated tiers",
		customizedLine({
			featureId: TestFeature.Users,
			price: graduatedTiers([
				{ to: 10, amount: 1, flat_amount: 50 },
				{ to: "inf", amount: 0.5, flat_amount: 50 },
			]),
		}),
	],
	[
		"tiers without a final inf",
		customizedLine({
			featureId: TestFeature.Storage,
			price: graduatedTiers([{ to: 100, amount: 1 }]),
			quantity: 200,
		}),
	],
	[
		"tiers out of order",
		customizedLine({
			featureId: TestFeature.Storage,
			price: graduatedTiers([
				{ to: 100, amount: 1 },
				{ to: 50, amount: 2 },
				{ to: "inf", amount: 3 },
			]),
			quantity: 200,
		}),
	],
	[
		"volume tiers on a usage_based price",
		{
			customize: {
				items: [
					{
						feature_id: TestFeature.Words,
						price: {
							billing_method: BillingMethod.UsageBased,
							interval: BillingInterval.Month,
							billing_units: 1,
							tier_behavior: TierBehavior.VolumeBased,
							tiers: [
								{ to: 10, amount: 1 },
								{ to: "inf", amount: 0.5 },
							],
						},
					},
				],
			},
			feature_quantities: [
				{
					feature_id: TestFeature.Words,
					billing_behavior: BillingMethod.UsageBased,
					quantity: 5,
				},
			],
		},
	],
	[
		"two customize.items for one feature",
		{
			customize: {
				items: [
					{ feature_id: TestFeature.Users, price: prepaid({ amount: 1 }) },
					{ feature_id: TestFeature.Users, price: prepaid({ amount: 100 }) },
				],
			},
			feature_quantities: [billed(TestFeature.Users, 1)],
		},
	],
	[
		"an override whose billing_method differs from the line's, with a catalog price",
		{
			customize: {
				items: [
					{
						feature_id: TestFeature.Users,
						price: prepaid({
							billing_method: BillingMethod.UsageBased,
							amount: 3,
						}),
					},
				],
			},
			feature_quantities: [billed(TestFeature.Users, 4)],
		},
	],
];

for (const [name, planParams] of invalidRequests) {
	test.concurrent(
		`${chalk.yellowBright("invoices.create customize validation: 400 for")} ${name}`,
		async () => {
			const { outcome } = await invoice({ plan: planParams });
			expect(
				outcome.ok,
				outcome.ok ? JSON.stringify(outcome.response.preview.lines) : "",
			).toBe(false);
			if (!outcome.ok) expect(outcome.status, outcome.message).toBe(400);
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("invoices.create customize validation: omitted tier_behavior is graduated with or without a catalog price")}`,
	async () => {
		const tiers = prepaid({
			amount: undefined,
			billing_units: 100,
			tiers: [
				{ to: 500, amount: 10 },
				{ to: "inf", amount: 5 },
			],
		});
		const { outcome } = await invoice({
			plan: {
				customize: {
					price: null,
					items: [
						{ feature_id: TestFeature.Messages, price: tiers },
						{ feature_id: TestFeature.Storage, price: tiers },
					],
				},
				feature_quantities: [
					billed(TestFeature.Messages, 700),
					billed(TestFeature.Storage, 700),
				],
			},
		});
		if (!outcome.ok) throw new Error(outcome.message);
		// Graduated: 5 packs at $10 + 2 packs at $5.
		expect(outcome.response.preview.lines.map((line) => line.amount)).toEqual([
			60, 60,
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create customize validation: a one-off customized line is not reported as prorated")}`,
	async () => {
		const { outcome } = await invoice({
			plan: {
				customize: {
					price: null,
					items: [
						{
							feature_id: TestFeature.Users,
							price: prepaid({ amount: 2, interval: BillingInterval.OneOff }),
						},
					],
				},
				feature_quantities: [
					{ ...billed(TestFeature.Users, 5), prorate: true },
				],
			},
			extra: {
				period_start: Date.UTC(2026, 0, 1),
				period_end: Date.UTC(2026, 0, 16),
			},
		});
		if (!outcome.ok) throw new Error(outcome.message);
		const [line] = outcome.response.preview.lines;
		expect({ amount: line.amount, prorated: line.prorated }).toEqual({
			amount: 10,
			prorated: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create customize validation: sub-cent lines preview the cents Stripe bills")}`,
	async () => {
		const { ctx, outcome } = await invoice({
			preview: false,
			plan: {
				customize: {
					price: null,
					items: [
						TestFeature.Users,
						TestFeature.Storage,
						TestFeature.Workflows,
					].map((featureId) => ({
						feature_id: featureId,
						price: prepaid({ amount: 0.335 }),
					})),
				},
				feature_quantities: [
					billed(TestFeature.Users, 1),
					billed(TestFeature.Storage, 1),
					billed(TestFeature.Workflows, 1),
				],
			},
		});
		if (!outcome.ok) throw new Error(outcome.message);
		const { preview } = outcome.response;
		expect({
			lines: preview.lines.map((line) => line.amount),
			subtotal: preview.subtotal,
			discount_total: preview.discount_total,
			total: preview.total,
		}).toEqual({
			lines: [0.34, 0.34, 0.34],
			subtotal: 1.02,
			discount_total: 0,
			total: 1.02,
		});
		await expectStripeInvoiceMatchesPreview({
			ctx,
			response: outcome.response,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create customize validation: a negative custom line item is still a credit")}`,
	async () => {
		const { outcome } = await invoice({
			plan: {},
			extra: {
				custom_line_items: [{ description: "Friends and family", amount: -10 }],
			},
		});
		if (!outcome.ok) throw new Error(outcome.message);
		expect(outcome.response.preview.total).toBe(10);
	},
);

const licenseCustomerId = "inv-create-customize-validation-license";
const licenseParent = products.pro({
	id: "customize-validation-license-parent",
	items: [],
});
const licenseSeat = products.base({
	id: "customize-validation-license-seat",
	items: [
		items.monthlyPrice({ price: 15 }),
		items.prepaidUsers({ billingUnits: 1 }),
	],
});

const runLicenseSetup = () =>
	initScenario({
		customerId: licenseCustomerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [licenseParent, licenseSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: licenseParent.id,
				licenseProductId: licenseSeat.id,
				included: 0,
			}),
		],
	});
let licenseSetupPromise: ReturnType<typeof runLicenseSetup> | undefined;

const invoiceLicense = async ({
	customizeItems,
	featureId,
}: {
	customizeItems: { feature_id: string; price: ItemPrice }[];
	featureId: string;
}) => {
	licenseSetupPromise ??= runLicenseSetup();
	const { autumnV2_3 } = await licenseSetupPromise;
	return postInvoiceCreate({
		autumnV2_3,
		params: {
			customer_id: licenseCustomerId,
			preview: true,
			plans: [
				{
					plan_id: licenseParent.id,
					customize: { price: null },
					license_quantities: [
						{
							license_plan_id: licenseSeat.id,
							quantity: 0,
							customize: { items: customizeItems },
							feature_quantities: [billed(featureId, 5)],
						},
					],
				},
			],
		},
	});
};

const invalidLicenseRequests: [string, Parameters<typeof invoiceLicense>[0]][] =
	[
		[
			"a negative license item amount",
			{
				featureId: TestFeature.Users,
				customizeItems: [
					{ feature_id: TestFeature.Users, price: prepaid({ amount: -2 }) },
				],
			},
		],
		[
			"license item tiers without a final inf",
			{
				featureId: TestFeature.Storage,
				customizeItems: [
					{
						feature_id: TestFeature.Storage,
						price: graduatedTiers([{ to: 100, amount: 1 }]),
					},
				],
			},
		],
		[
			"two license customize.items for one feature",
			{
				featureId: TestFeature.Users,
				customizeItems: [
					{ feature_id: TestFeature.Users, price: prepaid({ amount: 1 }) },
					{ feature_id: TestFeature.Users, price: prepaid({ amount: 100 }) },
				],
			},
		],
		[
			"a license item whose billing_method differs from the line's",
			{
				featureId: TestFeature.Users,
				customizeItems: [
					{
						feature_id: TestFeature.Users,
						price: prepaid({ billing_method: BillingMethod.UsageBased }),
					},
				],
			},
		],
	];

for (const [name, request] of invalidLicenseRequests) {
	test.concurrent(
		`${chalk.yellowBright("invoices.create license customize validation: 400 for")} ${name}`,
		async () => {
			const outcome = await invoiceLicense(request);
			expect(
				outcome.ok,
				outcome.ok ? JSON.stringify(outcome.response.preview.lines) : "",
			).toBe(false);
			if (!outcome.ok) expect(outcome.status, outcome.message).toBe(400);
		},
	);
}
