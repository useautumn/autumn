import { test } from "bun:test";
import { type ApiCustomerV5, customerEntitlements } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { logPlaybook } from "../catalog/utils/catalogScenario";

/**
 * Invoice credits QA: whether a credit balance itemizes is decided by the plan
 * item's price shape at attach and stamped on the balance. Each scenario below
 * attaches one shape, tracks Action1 (0.2 cr/unit) and Action2 (0.6 cr/unit),
 * advances to the renewal invoice and prints the stamp, the balance and the
 * invoice lines. Run one at a time.
 */

const INCLUDED = 100;
const USAGE = 250;

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const creditsRow = async ({
	ctx,
	customerId,
}: {
	ctx: Scenario["ctx"];
	customerId: string;
}) => {
	const rows = await ctx.db
		.select()
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_id, customerId),
				eq(customerEntitlements.feature_id, TestFeature.InvoiceCredits),
			),
		);
	return rows[0];
};

const printOutcome = async ({
	label,
	customerId,
	autumnV2_3,
	ctx,
}: {
	label: string;
	customerId: string;
	autumnV2_3: Scenario["autumnV2_3"];
	ctx: Scenario["ctx"];
}) => {
	const row = await creditsRow({ ctx, customerId });
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});

	console.log(chalk.bold(`\n─── ${label} ───`));
	console.log({
		stamped_invoice_credit: row?.invoice_credit,
		usage_attribution: row?.usage_attribution,
		balance: customer.balances?.[TestFeature.InvoiceCredits],
	});

	const renewal = customer.invoices?.[0];
	if (!renewal?.stripe_id) return;
	const lineItems = await waitForInvoiceLineItems({
		stripeInvoiceId: renewal.stripe_id,
	});
	console.log(chalk.bold(`invoice total: $${renewal.total}`));
	console.table(
		lineItems.map((line) => ({
			description: line.description,
			amount: line.amount,
			feature: line.feature_id ?? "—",
		})),
	);
};

const runShape = async ({
	customerId,
	item,
	label,
}: {
	customerId: string;
	item: ReturnType<typeof items.consumable>;
	label: string;
}) => {
	const product = products.pro({ id: customerId, items: [item] });
	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({ productId: product.id }),
			s.track({ featureId: TestFeature.Action1, value: USAGE }),
			s.track({ featureId: TestFeature.Action2, value: USAGE }),
			s.advanceToNextInvoice({ withPause: true }),
		],
	});
	await printOutcome({ label, customerId, autumnV2_3, ctx });
	return { autumnV2_3, ctx };
};

test(
	`${chalk.yellowBright("scenario: invoice credits at $0.10 per credit")}`,
	async () => {
		// 50 + 150 = 200 credits, 100 included → overage 100 → $10.
		await runShape({
			customerId: "ic-rate-tenth",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 0.1,
			}),
			label:
				"$0.10/credit → Action1 $5.00, Action2 $15.00, Credits applied -$10.00, total $30",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: invoice credits at $5 per 100 credits")}`,
	async () => {
		await runShape({
			customerId: "ic-rate-per-hundred",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 5,
				billingUnits: 100,
			}),
			label:
				"$5 per 100 credits → Action1 $2.50, Action2 $7.50, Credits applied -$5.00, total $25",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: graduated tiers stay a plain overage line")}`,
	async () => {
		await runShape({
			customerId: "ic-rate-tiered",
			item: {
				...items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
				}),
				price: undefined,
				tiers: [
					{ to: 150, amount: 0.1 },
					{ to: "inf", amount: 0.05 },
				],
			},
			label:
				"graduated tiers → stamp false, one ordinary overage line, no Credits applied",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: a stamped balance rejects manual edits, an unstamped one accepts them")}`,
	async () => {
		const stampedId = "ic-rate-locked";
		const plainId = "ic-rate-editable";
		const stamped = products.pro({
			id: stampedId,
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
					price: 0.1,
				}),
			],
		});
		const plain = products.pro({
			id: plainId,
			items: [
				items.free({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
				}),
			],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId: stampedId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([{ id: plainId, paymentMethod: "success" }]),
				s.products({ list: [stamped, plain] }),
			],
			actions: [
				s.billing.attach({ productId: stamped.id }),
				s.billing.attach({ customerId: plainId, productId: plain.id }),
			],
		});

		for (const customerId of [stampedId, plainId]) {
			const row = await creditsRow({ ctx, customerId });
			const outcome = await autumnV2_3.balances
				.update({
					customer_id: customerId,
					feature_id: TestFeature.InvoiceCredits,
					remaining: 70,
				})
				.then(() => "accepted")
				.catch((error: { message?: string }) => `rejected: ${error.message}`);
			console.log(chalk.bold(`\n─── ${customerId} ───`));
			console.log({ stamped_invoice_credit: row?.invoice_credit, outcome });
		}
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: playbook for the dashboard checks")}`,
	async () => {
		const customerId = "ic-rate-playbook";
		const { ctx } = await runShape({
			customerId,
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 0.1,
			}),
			label: "seeded for the dashboard playbook",
		});
		const row = await creditsRow({ ctx, customerId });

		logPlaybook({
			title: "Invoice credits at any flat rate",
			steps: [
				`Customers → "${customerId}" → Invoices → the renewal invoice lists "Action1, ${USAGE} units", "Action2, ${USAGE} units" and "Credits applied" priced at $0.10 per credit; the plan's Stripe subscription has no credits meter item.`,
				`Same customer → the credits balance is stamped (invoice_credit = ${row?.invoice_credit}); editing its remaining amount in the balance sheet is rejected with "Invoice-credit balances can only be changed through tracked usage and billing-cycle resets".`,
				`Plans → "${customerId}" → change the credits item price to $0.25 → save with versioning "existing" → this customer's stamp stays ${row?.invoice_credit} and its next invoice still prices at the rate it attached under; attach a NEW customer → its balance is stamped from the new price.`,
				`Features → the credit system's sheet has no "Invoice credits" switch; the docs section "Itemized invoice credits" describes the flat-rate rule.`,
				`Plans → give a credit item graduated tiers (0.10 to 150, then 0.05) → attach a new customer → stamp false, plain overage line on the renewal invoice, balance stays editable.`,
			],
		});
	},
	{ timeout: 240_000 },
);
