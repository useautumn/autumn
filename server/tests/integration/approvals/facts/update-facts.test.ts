import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { ProductItemInterval } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** `paid` on a change to an existing subscription follows what the next cycle bills. */

const billingUnits = 10;
const prepaidMessages = () =>
	products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				price: 5,
			}),
		],
	});

test.concurrent(
	`${chalk.yellowBright("update facts 1: more prepaid units raise next_cycle, so the update is paid")}`,
	async () => {
		const customerId = "approvals-facts-update-increase";
		const product = prepaidMessages();

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		};
		const preview = await autumnV2_1.subscriptions.previewUpdate(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.next_cycle?.total).toBe(100);
		expect(facts.paid).toBe(true);
		expect(facts.incoming[0].feature_quantities).toEqual([
			{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
		]);
		expect(facts.outgoing[0].plan_id).toBe(product.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("update facts 2: fewer prepaid units charge nothing new, so the update isn't paid")}`,
	async () => {
		const customerId = "approvals-facts-update-decrease";
		const product = prepaidMessages();

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
					],
				}),
			],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
		};
		const preview = await autumnV2_1.subscriptions.previewUpdate(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBeLessThanOrEqual(0);
		expect(facts.paid).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("update facts 3: a scheduled downgrade with no new charge isn't paid")}`,
	async () => {
		const customerId = "approvals-facts-downgrade";
		const messages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messages] });
		const premium = products.premium({ items: [messages] });

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: premium.id })],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: pro.id,
		};
		const preview = await autumnV2_1.billing.previewAttach(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.paid).toBe(false);
		expect(facts.plan_schedule).toBe("end_of_cycle");
		expect(facts.incoming[0].plan_id).toBe(pro.id);
		expect(facts.outgoing[0].plan_id).toBe(premium.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("update facts 4: more annual units on a monthly plan, unprorated, raise a later bill, so it's paid")}`,
	async () => {
		const customerId = "approvals-facts-update-annual-units";
		const product = products.base({
			id: "monthly-annual-units",
			items: [
				items.monthlyPrice({ price: 20 }),
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 5,
					interval: ProductItemInterval.Year,
				}),
			],
		});

		const { autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: product.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
			proration_behavior: "none",
		};
		const preview = await autumnV2_1.subscriptions.previewUpdate(params);
		const { _permission_facts: facts } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.paid).toBe(true);
	},
);
