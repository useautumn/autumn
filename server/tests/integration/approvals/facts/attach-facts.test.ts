import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Billing facts for attach, read from the preview's `_permission_facts`.
 * Every case checks the facts' totals against a plain preview of the same request.
 */

test.concurrent(
	`${chalk.yellowBright("attach facts 1: pro $20/mo charges the customer")}`,
	async () => {
		const customerId = "approvals-facts-attach-pro";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(20);
		expect(facts.paid).toBe(true);
		expect(facts.checkout).toBe(false);
		expect(facts.incoming).toHaveLength(1);
		expect(facts.incoming[0]).toMatchObject({
			plan_id: pro.id,
			paid: true,
			recurring: true,
			free_trial: null,
			customized: false,
		});
		expect(facts.outgoing).toEqual([]);
		expect(facts.invoice_mode).toEqual({ enabled: false });
		expect(facts.discounts).toEqual([]);
		expect(facts.plan_schedule).toBe("immediate");
	},
);

test.concurrent(
	`${chalk.yellowBright("attach facts 2: a free plan doesn't charge the customer")}`,
	async () => {
		const customerId = "approvals-facts-attach-free";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [free] })],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: free.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.paid).toBe(false);
		expect(facts.checkout).toBe(false);
		expect(facts.next_cycle).toBeNull();
		expect(facts.incoming[0]).toMatchObject({ plan_id: free.id, paid: false });
	},
);

test.concurrent(
	`${chalk.yellowBright("attach facts 3: a card-required trial that bills on end charges the customer")}`,
	async () => {
		const customerId = "approvals-facts-attach-trial-card";
		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: true,
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
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
		expect(facts.next_cycle?.total).toBe(20);
		expect(facts.paid).toBe(true);
		expect(facts.checkout).toBe(false);
		expect(facts.incoming[0].free_trial).toEqual({
			duration_length: 14,
			duration_type: "day",
			card_required: true,
			on_end: "bill",
		});
	},
);
