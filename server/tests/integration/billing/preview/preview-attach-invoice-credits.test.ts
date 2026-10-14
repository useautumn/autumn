import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (Stripe credit on file): present, sign-flipped to positive, currency matches")}`,
	async () => {
		const customerId = "invoice-credits-on";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { balance: -2000 },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(20);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (zero balance): present, balance=0, currency matches")}`,
	async () => {
		const customerId = "invoice-credits-zero";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(0);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(20);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (stripe_checkout flow): still present, frontend chooses not to render the row")}`,
	async () => {
		const customerId = "invoice-credits-stripe-checkout";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					stripeCustomerOverrides: { balance: -2000 },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.checkout_type).toBe("stripe_checkout");
		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(20);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(0);
	},
	300_000,
);
