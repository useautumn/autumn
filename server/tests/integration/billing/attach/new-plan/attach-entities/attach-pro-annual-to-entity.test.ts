import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("new-plan: attach pro annual to entity")}`,
	async () => {
		const customerId = "new-plan-attach-entity-annual";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const proAnnual = products.proAnnual({
			id: "pro-annual-ent",
			items: [messagesItem],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[0].id,
		});
		expect(preview.total).toBe(200);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: proAnnual.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);

		await expectProductActive({
			customer: entity,
			productId: proAnnual.id,
		});

		expectCustomerFeatureCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 200,
		});
	},
);
