import { expect, test } from "bun:test";
import {
	OnDecrease,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration/index.js";
import { items } from "@tests/utils/fixtures/items.js";
import {
	type AnchorQuantityVariant,
	expectAnchorQuantityReset,
} from "./anchorQuantityResetCase.js";
import {
	expectAnchorQuantityIdentity,
	setupAnchorQuantityScenario,
} from "./setupAnchorQuantityScenario.js";

const cases: AnchorQuantityVariant[] = [
	{ name: "mixed-one-off", old: 300, next: 500, oneOff: true },
	{ name: "reset-usage", old: 300, next: 500, resetUsage: true },
];
for (const variant of cases) {
	test.concurrent(`anchor quantities: ${variant.name}`, () =>
		expectAnchorQuantityReset(variant),
	);
}

test.concurrent(
	"anchor quantities: preserve unrelated pending decrease",
	async () => {
		const customerId = "anchor-qty-pending";
		const scenario = await setupAnchorQuantityScenario({
			customerId,
			quantity: 500,
			prepaidItem: items.prepaidMessages({
				prorationConfig: { onDecrease: OnDecrease.NoProrations },
			}),
			extraItems: [
				items.prepaid({
					featureId: "words",
					prorationConfig: { onDecrease: OnDecrease.NoProrations },
				}),
			],
			extraQuantities: [{ feature_id: "words", quantity: 500 }],
		});
		const { autumnV2_4, target, ctx, advancedTo } = scenario;
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			...target,
			feature_quantities: [
				{ feature_id: "messages", quantity: 200 },
				{ feature_id: "words", quantity: 200 },
			],
		});
		const before = await scenario.readProduct();
		const pendingWords = before.options.find(
			(option) => option.feature_id === "words",
		);
		expect(pendingWords).toMatchObject({ quantity: 5, upcoming_quantity: 2 });
		expect(
			before.options.find((option) => option.feature_id === "messages"),
		).toMatchObject({ quantity: 5, upcoming_quantity: 2 });
		const params: UpdateSubscriptionV1ParamsInput = {
			...target,
			feature_quantities: [{ feature_id: "messages", quantity: 300 }],
			billing_cycle_anchor: "now",
		};
		const preview =
			await autumnV2_4.subscriptions.previewUpdate<UpdateSubscriptionV1ParamsInput>(
				params,
			);
		expect(await scenario.readProduct()).toEqual(before);
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 120,
			newAmount: 100,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 2);
		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>(params);
		const { product } = await expectAnchorQuantityIdentity({
			scenario,
			anchorMs: advancedTo,
		});
		expect(
			product.options.find((option) => option.feature_id === "words"),
		).toEqual(pendingWords);
		const messages = product.options.find(
			(option) => option.feature_id === "messages",
		);
		expect(messages?.quantity).toBe(3);
		expect(messages?.upcoming_quantity == null).toBe(true);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
