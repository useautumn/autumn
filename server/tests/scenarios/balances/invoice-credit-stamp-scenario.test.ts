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
 * Invoice credits QA: itemization is derived from the plan item's price at
 * attach (pay-per-use, exactly one currency unit per credit, not pooled) and
 * stamped on the balance. Each scenario attaches one price shape, tracks
 * Action1 (0.2 cr/unit) and Action2 (0.6 cr/unit), advances to the renewal
 * invoice and prints the stamp, the ledger and the invoice lines. Run one at a
 * time; every customer it creates stays in the test org for dashboard review.
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
		customer_id: customerId,
		stamped_invoice_credit: row?.invoice_credit,
		usage_attribution: row?.usage_attribution,
		balance: customer.balances?.[TestFeature.InvoiceCredits],
	});

	const renewal = customer.invoices?.[0];
	if (!renewal?.stripe_id) return;
	const lineItems = await waitForInvoiceLineItems({
		stripeInvoiceId: renewal.stripe_id,
	});
	console.log(
		chalk.bold(
			`invoice total: $${renewal.total}  stripe: ${renewal.stripe_id}`,
		),
	);
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
	`${chalk.yellowBright("scenario: $1 per credit itemizes the invoice")}`,
	async () => {
		// 50 + 150 = 200 credits, 100 included → overage 100 → $100.
		await runShape({
			customerId: "ic-stamp-one-to-one",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 1,
			}),
			label:
				"$1/credit → stamp true, Action1 $50, Action2 $150, Credits applied -$100, total $120",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: $100 per 100 credits also itemizes")}`,
	async () => {
		await runShape({
			customerId: "ic-stamp-per-hundred",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 100,
				billingUnits: 100,
			}),
			label:
				"$100 per 100 credits → stamp true, same lines as $1/credit, total $120",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: a fractional price stays a plain overage line")}`,
	async () => {
		await runShape({
			customerId: "ic-stamp-fractional",
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 0.1,
			}),
			label:
				"$0.10/credit → stamp false, one ordinary overage line $10, no Credits applied, total $30",
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: a stamped balance rejects manual edits, a plain one accepts them")}`,
	async () => {
		const stampedId = "ic-stamp-locked";
		const plainId = "ic-stamp-editable";
		const stamped = products.pro({
			id: stampedId,
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: INCLUDED,
					price: 1,
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
		const customerId = "ic-stamp-playbook";
		const { ctx } = await runShape({
			customerId,
			item: items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: INCLUDED,
				price: 1,
			}),
			label: "seeded for the dashboard playbook",
		});
		const row = await creditsRow({ ctx, customerId });

		logPlaybook({
			title: "Invoice credits derived from the plan item price",
			steps: [
				`Customers → "${customerId}" → Invoices → open the renewal invoice: one line per feature ("Action1, ${USAGE} units", "Action2, ${USAGE} units"), a "Credits applied" refund line, and the base price; the Stripe subscription has no credits meter item.`,
				`Same customer → Balances → the credits balance is stamped (invoice_credit = ${row?.invoice_credit}); editing its remaining amount is rejected with "Invoice-credit balances can only be changed through tracked usage and billing-cycle resets".`,
				`Customers → "ic-stamp-fractional" → its renewal invoice has a single plain overage line and its balance is editable.`,
				`Plans → "${customerId}" → change the credits item price to $2 → save as an existing version → this customer's stamp stays ${row?.invoice_credit}; attach a NEW customer to the plan → its balance is stamped false (no longer 1:1) and bills as plain overage.`,
				`Features → the credit system sheet has no "Invoice credits" switch; features.get / atmn pull return no invoice_credit field; the docs section "Itemized invoice credits" describes the rule.`,
			],
		});
	},
	{ timeout: 240_000 },
);
