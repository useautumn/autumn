/** Each multi-attach plan resolves its own scope: inherit, customer, or explicit entity. */

import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	chalk.yellowBright("multi-attach: resolves scope per plan"),
	async () => {
		const inheritedPlan = products.base({
			id: "inherited",
			items: [
				items.monthlyPrice({ price: 5 }),
				items.monthlyMessages({ includedUsage: 10 }),
			],
		});
		const customerPlan = products.base({
			id: "customer",
			items: [
				items.monthlyPrice({ price: 10 }),
				items.monthlyWords({ includedUsage: 20 }),
			],
		});
		const explicitPlan = products.base({
			id: "explicit",
			items: [items.monthlyPrice({ price: 15 }), items.dashboard()],
		});

		const { autumnV1, autumnV2_2, customerId, entities } = await initScenario({
			customerId: "ma-plan-scopes",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [inheritedPlan, customerPlan, explicitPlan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plans: [
				{ plan_id: inheritedPlan.id },
				{ plan_id: customerPlan.id, entity_id: null },
				{ plan_id: explicitPlan.id, entity_id: entities[1].id },
			],
		});

		const [customer, inheritedEntity, explicitEntity] = await Promise.all([
			autumnV1.customers.get<ApiCustomerV3>(customerId),
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[0].id),
			autumnV1.entities.get<ApiEntityV0>(customerId, entities[1].id),
		]);

		await expectCustomerProducts({
			customer,
			active: [customerPlan.id, inheritedPlan.id, explicitPlan.id],
		});
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 30,
		});
		await expectCustomerProducts({
			customer: inheritedEntity,
			active: [customerPlan.id, inheritedPlan.id],
			notPresent: [explicitPlan.id],
		});
		await expectCustomerProducts({
			customer: explicitEntity,
			active: [customerPlan.id, explicitPlan.id],
			notPresent: [inheritedPlan.id],
		});
	},
);

test.concurrent(
	chalk.yellowBright(
		"multi-attach: preserves entity plans when adding scoped add-ons",
	),
	async () => {
		const base = products.base({
			id: "base",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const addOn = products.recurringAddOn({
			id: "add-on",
			items: [items.monthlyWords({ includedUsage: 20 })],
		});
		const { autumnV1, autumnV2_2, customerId, entities } = await initScenario({
			customerId: "ma-scoped-add-ons",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [base, addOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: base.id, entityIndex: 0 }),
				s.billing.attach({ productId: base.id, entityIndex: 1 }),
			],
		});

		await autumnV2_2.billing.multiAttach({
			customer_id: customerId,
			plans: entities.map((entity) => ({
				plan_id: addOn.id,
				entity_id: entity.id,
			})),
		});

		const scopedEntities = await Promise.all(
			entities.map((entity) =>
				autumnV1.entities.get<ApiEntityV0>(customerId, entity.id),
			),
		);
		for (const entity of scopedEntities) {
			await expectCustomerProducts({
				customer: entity,
				active: [base.id, addOn.id],
			});
		}
	},
);
