import { expect, test } from "bun:test";
import { activateScheduledCustomerProductsWithDependencies } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionUpdated/tasks/handleSchedulePhaseChanges/activateScheduledCustomerProducts.js";

test("each scheduled activation is completed before a later activation can fail", async () => {
	const events: string[] = [];
	const preparedActivations = ["one", "two"].map((id) => ({
		customerProduct: { id },
		autumnBillingPlan: { customerId: "customer", marker: id },
		updates: {},
	}));

	await expect(
		activateScheduledCustomerProductsWithDependencies({
			ctx: {} as never,
			eventContext: {} as never,
			dependencies: {
				prepareScheduledCustomerProducts: async () =>
					preparedActivations as never,
				executeAutumnBillingPlan: async ({ autumnBillingPlan }) => {
					const marker = (autumnBillingPlan as unknown as { marker: string })
						.marker;
					events.push(`execute:${marker}`);
					if (marker === "two") throw new Error("second activation failed");
					return {} as never;
				},
				completeScheduledCustomerProducts: async ({
					preparedActivations: completed,
				}) => {
					for (const activation of completed) {
						events.push(`complete:${activation.customerProduct.id}`);
					}
				},
			},
		}),
	).rejects.toThrow("second activation failed");

	expect(events).toEqual(["execute:one", "complete:one", "execute:two"]);
});
