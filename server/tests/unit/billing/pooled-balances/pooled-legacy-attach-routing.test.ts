import { expect, test } from "bun:test";
import { AttachBranch } from "@autumn/shared";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";

const createPooledEntityAttachParams = ({
	productCount = 1,
}: {
	productCount?: number;
} = {}) =>
	({
		customer: {
			id: "customer_one",
			internal_id: "internal_customer_one",
			name: "Customer One",
			entity: { id: "entity_one", internal_id: "internal_entity_one" },
		},
		products: Array.from({ length: productCount }, (_, index) => ({
			id: `product_${index + 1}`,
			name: `Product ${index + 1}`,
		})),
		entitlements: [{ id: "entitlement_messages", pooled: true }],
		prices: [],
		invoiceOnly: false,
	}) as never;

test("legacy single-product entity attach routes pooled items through the V2 billing plan", async () => {
	let legacyPlanCalls = 0;
	const result = await handleAddProduct({
		ctx: {} as never,
		attachParams: createPooledEntityAttachParams(),
		branch: AttachBranch.New,
		dependencies: {
			legacyAttach: async () => {
				legacyPlanCalls += 1;
				return {
					billingResponse: {},
					billingResult: { stripe: {} },
				} as never;
			},
		},
	});

	expect(legacyPlanCalls).toBe(1);
	expect(result.code).toBe("free_product_attached");
});

test("legacy multi-product entity attach rejects pooled items before partial persistence", async () => {
	let legacyPlanCalls = 0;

	await expect(
		handleAddProduct({
			ctx: {} as never,
			attachParams: createPooledEntityAttachParams({ productCount: 2 }),
			branch: AttachBranch.MultiProduct,
			dependencies: {
				legacyAttach: async () => {
					legacyPlanCalls += 1;
					return {} as never;
				},
			},
		}),
	).rejects.toThrow("one product at a time");

	expect(legacyPlanCalls).toBe(0);
});
