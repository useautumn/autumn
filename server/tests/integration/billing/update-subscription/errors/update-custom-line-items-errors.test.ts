import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ErrCode,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

// Custom lines cannot override cancellation/refund policy, one-off updates, manual top-ups, or trial removal.
// Both preview and execution must reject before changing the customer's state or invoices.
const errorCases: {
	name: string;
	changes: Partial<UpdateSubscriptionV1ParamsInput>;
	message: string;
}[] = [
	{
		name: "cancel-immediately",
		changes: { cancel_action: "cancel_immediately" },
		message: "custom_line_items cannot be used together with cancel_action",
	},
	{
		name: "cancel-end-of-cycle",
		changes: { cancel_action: "cancel_end_of_cycle" },
		message: "custom_line_items cannot be used together with cancel_action",
	},
	{
		name: "uncancel",
		changes: { cancel_action: "uncancel" },
		message: "custom_line_items cannot be used together with cancel_action",
	},
	{
		name: "refund",
		changes: {
			cancel_action: "cancel_immediately",
			refund_last_payment: "full",
		},
		message:
			"custom_line_items cannot be used together with refund_last_payment",
	},
	{
		name: "one-off",
		changes: {},
		message: "custom_line_items is not supported for one-off products",
	},
	{
		name: "manual-top-up",
		changes: {
			feature_quantities: [{ feature_id: "messages", quantity: 100 }],
		},
		message: "A manual top-up can only change feature quantities",
	},
	{
		name: "trial-removal",
		changes: { customize: { free_trial: null } },
		message:
			"custom_line_items cannot be used when the subscription update creates a Stripe-managed invoice",
	},
];

for (const { name, changes, message } of errorCases) {
	test.concurrent(`update custom line items rejects ${name}`, async () => {
		const customerId = `update-custom-lines-error-${name}`;
		const planItems =
			name === "manual-top-up"
				? [
						items.oneOffMessages({
							includedUsage: 0,
							billingUnits: 100,
							price: 10,
						}),
					]
				: [items.monthlyMessages({ includedUsage: 100 })];
		let plan = products.pro({ id: "pro", items: planItems });
		if (name === "one-off") {
			plan = products.oneOff({
				id: "pro",
				items: [items.lifetimeMessages({ includedUsage: 100 })],
			});
		}
		if (name === "trial-removal") {
			plan = products.proWithTrial({
				id: "pro",
				items: planItems,
				trialDays: 7,
				cardRequired: true,
			});
		}
		const { autumnV1, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					...(name === "manual-top-up"
						? { options: [{ feature_id: "messages", quantity: 100 }] }
						: {}),
				}),
			],
		});
		if (name === "uncancel") {
			await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: plan.id,
				cancel_action: "cancel_end_of_cycle",
			});
		}
		const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const invoicesBefore = await autumnV1.customers.get(customerId);
		const params = {
			customer_id: customerId,
			plan_id: plan.id,
			...changes,
			custom_line_items: [{ amount: 17, description: "Unsupported override" }],
		};
		for (const invoke of [
			autumnV2_2.subscriptions.previewUpdate,
			autumnV2_2.subscriptions.update,
		]) {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: message,
				func: () => invoke<typeof params>(params),
			});
		}
		const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(after.subscriptions).toEqual(before.subscriptions);
		expectBalanceCorrect({
			customer: after,
			featureId: "messages",
			remaining: 100,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: invoicesBefore.invoices?.length ?? 0,
		});
	});
}
