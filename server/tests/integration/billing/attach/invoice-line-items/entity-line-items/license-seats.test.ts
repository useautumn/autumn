/**
 * License seats bill as one customer-level line on the parent plan.
 * Included seats are a pool, so there is no per-entity share: entities: [].
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const SEAT_PRICE = 20;
const INCLUDED = 2;
const REQUESTED = 5;

test.concurrent(
	`${chalk.yellowBright("entity-li: license seats → plan_id is the seat plan, quantity is paid seats, entities []")}`,
	async () => {
		const customerId = "entity-li-license";
		const pro = products.base({ id: "pro", items: [items.dashboard()] });
		const devSeat = products.base({
			id: "dev-seat",
			items: [items.monthlyPrice({ price: SEAT_PRICE })],
			group: "dev-seat-licenses",
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: devSeat.id,
					included: INCLUDED,
				}),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [
				{ license_plan_id: devSeat.id, quantity: REQUESTED },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: customer.invoices![0].stripe_id,
		});

		const seatLine = rows.find((li) => li.product_id === devSeat.id)!;
		expect(seatLine).toBeDefined();
		expect(seatLine.amount).toBe((REQUESTED - INCLUDED) * SEAT_PRICE);
		expect(seatLine.paid_quantity).toBe(REQUESTED - INCLUDED);
		expect(seatLine.entities).toEqual([]);
	},
);
