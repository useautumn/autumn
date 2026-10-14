import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: entity-level addon cancel")}`,
	async () => {
		const customerId = "cancel-addon-eoc-entity";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: "users" }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: addon.id, entityIndex: 0 }),
			],
		});

		const entityId = entities[0].id;

		const entityAfterAttach = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterAttach,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entityAfterAttach,
			productId: addon.id,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: addon.id,
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		await expectProductActive({
			customer: entityAfterAdvance,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: addon.id,
		});
	},
);
