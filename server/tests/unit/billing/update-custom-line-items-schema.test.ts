import { expect, test } from "bun:test";
import { UpdateSubscriptionV1ParamsSchema } from "@autumn/shared";

// Custom invoice lines must survive validation, including when they are the only update.
test("update accepts custom_line_items as the only update field", () => {
	const params = {
		customer_id: "custom-lines-customer",
		plan_id: "pro",
		custom_line_items: [{ amount: 17, description: "Agreed charge" }],
	};
	expect(UpdateSubscriptionV1ParamsSchema.parse(params)).toMatchObject(params);
});

test("update preserves custom charges and credits alongside quantity changes", () => {
	const params = {
		customer_id: "custom-lines-customer",
		plan_id: "pro",
		feature_quantities: [{ feature_id: "messages", quantity: 500 }],
		custom_line_items: [
			{ amount: 20, description: "Charge" },
			{ amount: -3, description: "Credit" },
		],
	};
	expect(UpdateSubscriptionV1ParamsSchema.parse(params)).toMatchObject(params);
});

test("update rejects malformed custom invoice lines", () => {
	expect(
		UpdateSubscriptionV1ParamsSchema.safeParse({
			customer_id: "custom-lines-customer",
			feature_quantities: [{ feature_id: "messages", quantity: 500 }],
			custom_line_items: [{ amount: "17", description: "Invalid charge" }],
		}).success,
	).toBe(false);
});

test("update rejects an empty custom invoice line array", () => {
	const result = UpdateSubscriptionV1ParamsSchema.safeParse({
		customer_id: "custom-lines-customer",
		plan_id: "pro",
		custom_line_items: [],
	});
	expect(result.success).toBe(false);
	if (result.success) throw new Error("Expected empty custom lines to fail");
	expect(result.error.issues).toContainEqual(
		expect.objectContaining({
			code: "too_small",
			path: ["custom_line_items"],
		}),
	);
});
