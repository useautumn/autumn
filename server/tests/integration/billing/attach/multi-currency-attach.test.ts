import { and, eq } from "drizzle-orm";
import { expect, test } from "bun:test";
import { type ApiCustomerV3, customers, ErrCode } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Regression: a normal single-currency (org-default) attach must NOT be blocked.
test.concurrent(
	`${chalk.yellowBright("multi-currency: single-currency attach is not blocked")}`,
	async () => {
		const pro = products.pro({
			id: "mc_ok",
			items: [items.monthlyMessages()],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "mc-ok",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductActive({ customer, productId: pro.id });
	},
);

// Guard: a customer locked to EUR cannot attach a USD-only plan (no Stripe call).
test.concurrent(
	`${chalk.yellowBright("multi-currency: attach blocked when plan lacks the customer's currency")}`,
	async () => {
		const pro = products.pro({
			id: "mc_block",
			items: [items.monthlyMessages()],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "mc-block",
			setup: [
				s.customer({ paymentMethod: "success", data: { currency: "eur" } }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.CurrencyMismatch,
			func: () =>
				autumnV1.billing.attach({
					customer_id: customerId,
					product_id: pro.id,
				}),
		});
	},
);

// Lock: a null-currency customer's first paid attach locks customer.currency.
test.concurrent(
	`${chalk.yellowBright("multi-currency: first paid attach locks the customer currency")}`,
	async () => {
		const pro = products.pro({
			id: "mc_lock",
			items: [items.monthlyMessages()],
		});

		const { customerId, ctx } = await initScenario({
			customerId: "mc-lock",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const [row] = await ctx.db
			.select({ currency: customers.currency })
			.from(customers)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			);

		expect(row?.currency).toBe("usd");
	},
);
