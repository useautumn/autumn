import { expect, test } from "bun:test";
import type { CreateScheduleParamsV0Input } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Every billing route builds facts in the action, so each preview carries them. */

test.concurrent(
	`${chalk.yellowBright("route facts 1: a create-schedule preview carries facts that match its totals")}`,
	async () => {
		const customerId = "approvals-facts-create-schedule";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const params: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] }],
		};
		const preview = await permissionFactsClient().post(
			"/billing.preview_create_schedule",
			params,
		);

		expectFactsMatchPreview({ facts: preview._permission_facts, preview });
		expect(preview._permission_facts.incoming[0].plan_id).toBe(pro.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("route facts 2: a multi-update preview carries each item's own facts")}`,
	async () => {
		const customerId = "approvals-facts-multi-update";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.attach({ productId: addon.id }),
			],
		});

		const preview = await permissionFactsClient().billing.previewMultiUpdate({
			customer_id: customerId,
			updates: [
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				{ plan_id: addon.id, cancel_action: "cancel_immediately" },
			],
		});

		expect(
			preview._permission_facts.map(
				({ cancel_action }: { cancel_action: string }) => cancel_action,
			),
		).toEqual(["cancel_end_of_cycle", "cancel_immediately"]);
	},
);
