import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test(`${chalk.yellowBright("renamed license plan → the parent's link follows (by internal id), attach with license quantities still resolves")}`, async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({
				userEmail: `${uniqueTestId("atmn")}@autumn.test`,
			}),
			s.otherCustomers([{ id: "cus_on_enterprise", paymentMethod: "success" }]),
		],
		config: `{
	plans: [
		plan({ active: true, planId: "seat", name: "Seat", versionSlug: "v1", price: { amount: 15, interval: "month" } }),
		plan({
			active: true,
			planId: "enterprise",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "seat", versionSlug: "v1", included: 25 }],
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

		scenario.writeConfig(
			atmnConfigSource({
				body: `{
	plans: [
		plan({ active: true, planId: "seatNew", internalId: "${seat.internal_id}", name: "Seat", versionSlug: "v1", price: { amount: 15, interval: "month" } }),
		plan({
			active: true,
			planId: "enterprise",
			name: "Enterprise",
			versionSlug: "v1",
			price: { amount: 999, interval: "month" },
			licenses: [{ licensePlanId: "seatNew", versionSlug: "v1", included: 25 }],
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
});
