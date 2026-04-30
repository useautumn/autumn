import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
