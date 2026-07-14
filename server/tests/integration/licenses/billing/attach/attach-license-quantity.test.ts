import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("license-attach: paid license quantity invoices monthly seats")}`,
	async () => {
		const customerId = "license-attach-paid-quantity";
		const pro = products.base({
			id: "pro",
			items: [items.dashboard()],
		});
		const devSeat = products.base({
			id: "dev-seat",
			items: [items.monthlyPrice({ price: 20 })],
			group: "dev-seat-licenses",
		});

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [pro, devSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: pro.id,
					licenseProductId: devSeat.id,
					included: 2,
				}),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: devSeat.id, quantity: 5 }],
		});

		// 5 seats total, 2 included → 3 paid × $20/mo
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: 60,
		});

		const { pools } = await getLicenseDbState({ db: ctx.db, customerId });
		expect(pools).toHaveLength(1);
		expect(pools[0].granted).toBe(5);
		expect(pools[0].paid_quantity).toBe(3);
		expect(pools[0].remaining).toBe(5);
	},
);
