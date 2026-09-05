/**
 * atmn crud/plans/rename — renamed license plan → the parent's link follows (by internal id), attach with license quantities still resolves
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("renamed license plan → the parent's link follows (by internal id), attach with license quantities still resolves")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
				s.otherCustomers([
					{ id: "cus_on_enterprise", paymentMethod: "success" },
				]),
			],
			config: `{
	plans: [
		plan({ planId: "seat", name: "Seat", price: { amount: 15, interval: "month" } }),
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "seat", included: 25 }],
		}),
	],
}`,
		});

		try {
			await scenario.push();
			const seat = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "seat",
			});

			// The license plan is renamed by its internalId. A push is the whole
			// desired catalog (skip_deletions: false), so `enterprise` has to be
			// restated too — otherwise its omission reads as a removal.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "seatNew", internalId: "${seat.internal_id}", name: "Seat" }),
		plan({
			planId: "enterprise",
			name: "Enterprise",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "seat", included: 25 }],
		}),
	],
}`,
				}),
			);
			await scenario.push();

			const enterprise =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("enterprise");
			// @ts-expect-error licenses is not on the generated plan response type yet
			expect(enterprise.licenses).toEqual([
				expect.objectContaining({ license_plan_id: "seatNew", included: 25 }),
			]);

			await scenario.attachCustomer({
				planId: "enterprise",
				customerId: "cus_on_enterprise",
			});
			await expectCustomerProducts({
				customerId: "cus_on_enterprise",
				autumn: scenario.autumnV2_3,
				active: ["enterprise"],
			});
		} finally {
			scenario.cleanup();
		}
	},
);
