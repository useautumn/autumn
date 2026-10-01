import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Invoice-mode drafts with enable_plan_immediately: the plan stays pending
 * until the draft is finalized in Stripe, then activates without payment.
 */
const PLAN_GROUP = "draft-pending";
const BILLING_UNITS = 10;
const SCENARIO_TIMEOUT_MS = 300_000;

const buildPro = () =>
	products.base({
		id: "draft-pro",
		group: PLAN_GROUP,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});

const buildPremium = () =>
	products.base({
		id: "draft-premium",
		group: PLAN_GROUP,
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.monthlyPrice({ price: 80 }),
		],
	});

const draftInvoiceMode = {
	invoice: true,
	enableProductImmediately: true,
	finalizeInvoice: false,
};

test(
	`${chalk.yellowBright("scenario: new plan pending on a draft invoice")}`,
	async () => {
		const pro = buildPro();
		await initScenario({
			customerId: "seed-draft-pending-new",
			setup: [
				s.deleteCustomer({ customerId: "seed-draft-pending-new" }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro], prefix: "draft-new" }),
			],
			actions: [s.billing.attach({ productId: pro.id, ...draftInvoiceMode })],
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);

test(
	`${chalk.yellowBright("scenario: upgrade pending on a draft invoice, pro stays active")}`,
	async () => {
		const pro = buildPro();
		const premium = buildPremium();
		await initScenario({
			customerId: "seed-draft-pending-upgrade",
			setup: [
				s.deleteCustomer({ customerId: "seed-draft-pending-upgrade" }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro, premium], prefix: "draft-upgrade" }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: premium.id, ...draftInvoiceMode }),
			],
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);

test(
	`${chalk.yellowBright("scenario: quantity increase held on a draft invoice")}`,
	async () => {
		const customerId = "seed-draft-pending-quantity";
		const seats = products.base({
			id: "draft-seats",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits: BILLING_UNITS,
				}),
			],
		});
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [seats], prefix: "draft-quantity" }),
			],
			actions: [
				s.billing.attach({
					productId: seats.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 10 * BILLING_UNITS,
						},
					],
				}),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: seats.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * BILLING_UNITS },
			],
			invoice: true,
			enable_product_immediately: true,
			finalize_invoice: false,
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);

test(
	`${chalk.yellowBright("scenario: control - draft without enable immediately waits for payment")}`,
	async () => {
		const pro = buildPro();
		await initScenario({
			customerId: "seed-draft-pending-control",
			setup: [
				s.deleteCustomer({ customerId: "seed-draft-pending-control" }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro], prefix: "draft-control" }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					...draftInvoiceMode,
					enableProductImmediately: false,
				}),
			],
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);

test(
	`${chalk.yellowBright("scenario: trial plan on a $0 draft invoice")}`,
	async () => {
		const trialPro = products.base({
			id: "draft-trial-pro",
			trialDays: 7,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyPrice({ price: 20 }),
			],
		});
		await initScenario({
			customerId: "seed-draft-pending-trial",
			setup: [
				s.deleteCustomer({ customerId: "seed-draft-pending-trial" }),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [trialPro], prefix: "draft-trial" }),
			],
			actions: [
				s.billing.attach({ productId: trialPro.id, ...draftInvoiceMode }),
			],
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);

test(
	`${chalk.yellowBright("scenario: customer with products ready for the dashboard Send Invoice flow")}`,
	async () => {
		const pro = buildPro();
		const premium = buildPremium();
		await initScenario({
			customerId: "seed-draft-pending-dashboard",
			setup: [
				s.deleteCustomer({ customerId: "seed-draft-pending-dashboard" }),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					email: "draft-qa@example.com",
				}),
				s.products({ list: [pro, premium], prefix: "draft-dashboard" }),
			],
			actions: [],
		});
	},
	{ timeout: SCENARIO_TIMEOUT_MS },
);
