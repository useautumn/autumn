import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Set plans facts read each phase as it would bill, not every phase at once. */

const monthlyPlan = ({ id, price }: { id: string; price: number }) =>
	products.base({
		id,
		items: [
			items.monthlyPrice({ price }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

test.concurrent(
	`${chalk.yellowBright("set plans facts 1: stepping down to cheaper plans in later phases isn't paid")}`,
	async () => {
		const customerId = "approvals-facts-set-plans-cheaper";
		const large = monthlyPlan({ id: "large", price: 60 });
		const medium = monthlyPlan({ id: "medium", price: 40 });
		const small = monthlyPlan({ id: "small", price: 30 });

		const { advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [large, medium, small] }),
			],
			actions: [s.attach({ productId: large.id })],
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: large.id }] },
				{
					starts_at: advancedTo + ms.days(40),
					plans: [{ plan_id: medium.id }],
				},
				{ starts_at: advancedTo + ms.days(80), plans: [{ plan_id: small.id }] },
			],
		};
		// Test-only field, outside the typed set plans preview.
		const preview = (await permissionFactsClient().billing.previewSetPlans(
			params,
		)) as {
			_permission_facts: { paid: boolean; incoming: { plan_id: string }[] };
		};
		const facts = preview._permission_facts;

		expect(
			facts.incoming.map(({ plan_id }: { plan_id: string }) => plan_id),
		).toEqual(expect.arrayContaining([medium.id, small.id]));
		expect(facts.paid).toBe(false);
	},
);
