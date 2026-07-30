/** Red: one entity counts against both plans. Green: pooled base + add-on capacity counts it once. */

import { test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("addon entity usage: existing entity is counted once across base and add-on")}`,
	async () => {
		const customerId = "addon-existing-entity-usage";
		const base = products.base({
			id: "base",
			items: [items.freeUsers({ includedUsage: 4 })],
		});
		const addon = products.base({
			id: "extra-users",
			isAddOn: true,
			items: [items.prepaidUsers()],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base, addon] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: base.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.entities.create(customerId, [
			{ id: "user-1", name: "User 1", feature_id: TestFeature.Users },
		]);
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: addon.id,
			feature_quantities: [{ feature_id: TestFeature.Users, quantity: 2 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Users,
			granted: 6,
			usage: 1,
			remaining: 5,
			breakdownCount: 2,
		});
	},
);
