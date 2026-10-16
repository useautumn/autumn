import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Facts describe the plan as the customer would get it, customizations applied. */

test.concurrent(
	`${chalk.yellowBright("customize facts 1: customize.price turns a free plan paid")}`,
	async () => {
		const customerId = "approvals-facts-customize-price";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: free.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(30);
		expect(facts.paid).toBe(true);
		expect(facts.incoming[0]).toMatchObject({
			plan_id: free.id,
			paid: true,
			customized: true,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("customize facts 2: adding a usage price makes the attach paid")}`,
	async () => {
		const customerId = "approvals-facts-customize-usage";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: free.id,
			customize: {
				items: [
					itemsV2.monthlyMessages({ included: 100 }),
					itemsV2.consumableWords({ included: 0 }),
				],
			},
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.paid).toBe(true);
		expect(facts.incoming[0]).toMatchObject({ paid: true, customized: true });
	},
);

test.concurrent(
	`${chalk.yellowBright("customize facts 3: in a multi-attach, only the customized plan reads customized")}`,
	async () => {
		const customerId = "approvals-facts-customize-multi";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const addon = products.recurringAddOn({ id: "addon", items: [messages] });

		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [],
		});

		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewMultiAttach({
				customer_id: customerId,
				plans: [
					{ plan_id: pro.id },
					{
						plan_id: addon.id,
						customize: { price: itemsV2.monthlyPrice({ amount: 30 }) },
					},
				],
			});

		expect(facts.incoming).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ plan_id: pro.id, customized: false }),
				expect.objectContaining({ plan_id: addon.id, customized: true }),
			]),
		);
	},
);
