import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectProductScheduled } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";

/**
 * Attach Start Date Scenario
 *
 * Sets up the data needed to manually exercise the new "Start Date" row
 * on the Attach sheet (vite/.../attach-v2/components/AttachAdvancedSection.tsx).
 *
 * The row only renders when:
 *   - product is paid recurring
 *   - customer has no active subscription
 *   - free trial is not selected
 *   - plan_schedule !== "end_of_cycle"
 *
 * Setup:
 * - Pro product: $20/month with 100 messages (paid recurring, no trial)
 * - Customer with a saved payment method, no products attached
 *
 * Once seeded, open the customer in the dashboard and click Attach → the
 * Start Date row should appear in the Advanced section. Pick a future
 * date to create a scheduled subscription; pick now to attach immediately.
 */

test(`${chalk.yellowBright("attach-start-date: customer with saved card, no active sub, paid recurring product")}`, async () => {
	const customerId = "attach-start-date";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	await initScenario({
		customerId,
		setup: [
			s.products({ list: [pro] }),
			s.customer({ paymentMethod: "success" }),
		],
		actions: [],
	});
});

test(`${chalk.yellowBright("attach-start-date: already scheduled paid recurring product")}`, async () => {
	const customerId = "attach-start-date-scheduled";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV2_2, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.products({ list: [pro] }),
			s.customer({ paymentMethod: "success" }),
		],
		actions: [],
	});

	const startDate = addDays(advancedTo, 2).getTime();
	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		starts_at: startDate,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectProductScheduled({
		customer,
		productId: pro.id,
		startsAt: startDate,
	});
});

test(`${chalk.yellowBright("attach-start-date: active subscription hides starts_at option")}`, async () => {
	const customerId = "attach-start-date-active-sub";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.products({ list: [pro, addon] }),
			s.customer({ paymentMethod: "success" }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
});
