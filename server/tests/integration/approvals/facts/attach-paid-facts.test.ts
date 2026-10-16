import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * `paid` around trials and checkout: charges the customer opts into by adding a
 * card don't count, checkout links do.
 */

test.concurrent(
	`${chalk.yellowBright("attach paid facts 1: a card-less trial on a paid plan isn't paid")}`,
	async () => {
		const customerId = "approvals-facts-trial-no-card";
		const proTrial = products.proWithTrial({
			id: "pro-trial-no-card",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
			cardRequired: false,
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proTrial.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.checkout).toBe(false);
		expect(facts.paid).toBe(false);
		expect(facts.incoming[0].free_trial).toMatchObject({
			duration_length: 7,
			card_required: false,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach paid facts 2: a checkout link is paid and sets checkout")}`,
	async () => {
		const customerId = "approvals-facts-checkout";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expect(preview.redirect_to_checkout).toBe(true);
		expectFactsMatchPreview({ facts, preview });
		expect(facts.checkout).toBe(true);
		expect(facts.paid).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("attach paid facts 3: a card-required trial with no card on file goes to checkout and is paid")}`,
	async () => {
		const customerId = "approvals-facts-trial-checkout";
		const proTrial = products.proWithTrial({
			id: "pro-trial-checkout",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
			cardRequired: true,
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [proTrial] })],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proTrial.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.checkout).toBe(true);
		expect(facts.paid).toBe(true);
	},
);
