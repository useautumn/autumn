import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** A cancel preview returns BillingCancel facts: the action, the cancelled plans and any refund. */

test.concurrent(
	`${chalk.yellowBright("cancel facts 1: cancel at end of cycle has no refund")}`,
	async () => {
		const customerId = "approvals-facts-cancel-eoc";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		};
		const preview = await autumnV2_1.subscriptions.previewUpdate(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expect(preview.refund ?? null).toBeNull();
		expect(facts.cancel_action).toBe("cancel_end_of_cycle");
		expect(facts.refund).toBeNull();
		expect(
			facts.outgoing.map(({ plan_id }: { plan_id: string }) => plan_id),
		).toEqual([pro.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("cancel facts 2: cancel immediately with a full refund carries the preview's refund")}`,
	async () => {
		const customerId = "approvals-facts-cancel-refund";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
			refund_last_payment: "full",
		};
		const preview = await autumnV2_1.subscriptions.previewUpdate(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expect(preview.refund?.amount).toBe(20);
		expect(facts.cancel_action).toBe("cancel_immediately");
		expect(facts.refund).toEqual({ amount: preview.refund.amount });
		expect(
			facts.outgoing.map(({ plan_id }: { plan_id: string }) => plan_id),
		).toEqual([pro.id]);
	},
);
