import { expect, test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const MESSAGES_INCLUDED = 100;
const OVERAGE_PRICE = 0.5;

const buildPlan = ({ id }: { id: string }) => {
	const grantItem = items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED });
	const meteredItem = items.consumableMessages({
		includedUsage: 0,
		price: OVERAGE_PRICE,
	});
	return {
		meteredItem,
		plan: products.pro({ id, items: [grantItem, meteredItem] }),
	};
};

const readMessagesSubtotal = async ({
	autumn,
	customerId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];
	customerId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.InvoicePreviews],
	});
	const line = customer.invoice_previews?.[0]?.line_items.find(
		(lineItem) => lineItem.feature_id === TestFeature.Messages,
	);
	return line?.subtotal ?? 0;
};

test.concurrent(
	`${chalk.yellowBright("p2p: grant -> unlimited does not bill usage the grant covered")}`,
	async () => {
		const customerId = "unlim-grant-covered";
		const { meteredItem, plan } = buildPlan({ id: "unlim-grant-covered-pro" });
		const tracked = 80;

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 5000,
				}),
			],
		});

		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			usage: tracked,
			balance: MESSAGES_INCLUDED - tracked,
		});
		expect(
			await readMessagesSubtotal({ autumn: autumnV2_2, customerId }),
			"precondition: usage is fully covered by the grant, nothing billable",
		).toBe(0);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [items.unlimitedMessages(), meteredItem],
		});

		expect(
			await readMessagesSubtotal({ autumn: autumnV2_2, customerId }),
			"usage covered by the old grant must not become billable overage",
		).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("p2p: grant -> unlimited keeps overage accrued before the edit")}`,
	async () => {
		const customerId = "unlim-carry-overage";
		const { meteredItem, plan } = buildPlan({ id: "unlim-carry-overage-pro" });
		const tracked = 150;
		const expectedOverage = (tracked - MESSAGES_INCLUDED) * OVERAGE_PRICE;

		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 5000,
				}),
			],
		});

		await expectCustomerFeatureCorrect({
			customerId,
			autumn: autumnV1,
			featureId: TestFeature.Messages,
			usage: tracked,
		});
		expect(
			await readMessagesSubtotal({ autumn: autumnV2_2, customerId }),
			"precondition: 50 units above the grant are already billable",
		).toBe(expectedOverage);

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [items.unlimitedMessages(), meteredItem],
		});

		expect(
			await readMessagesSubtotal({ autumn: autumnV2_2, customerId }),
			"overage owed before the edit survives the grant becoming unlimited",
		).toBe(expectedOverage);
	},
);
