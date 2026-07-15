import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { Feature, FullProduct, ProductItem } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { updateProductItems } from "@/internal/product/actions/updateProduct/updateProductItems.js";
import { ProductService } from "@/internal/products/ProductService.js";

const simulatedWriteFailure = new Error("simulated write failure");

afterEach(() => {
	mock.restore();
});

test("plan item updates run the no-customer path in a transaction", async () => {
	let transactionInsertCalled = false;
	const transactionDb = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: async () => undefined,
					orderBy: () => ({ for: async () => undefined }),
				}),
			}),
		}),
		insert: () => ({
			values: async () => {
				transactionInsertCalled = true;
				throw simulatedWriteFailure;
			},
		}),
	} as unknown as DrizzleCli;
	const db = {
		transaction: async (callback: (transaction: DrizzleCli) => Promise<void>) =>
			callback(transactionDb),
	} as unknown as DrizzleCli;
	const ctx = { org: { config: {} } } as AutumnContext;
	const fullProduct = {
		id: "atomic-plan",
		internal_id: "atomic-plan-internal",
		org_id: "atomic-org",
		env: "sandbox",
		version: 1,
		prices: [],
		entitlements: [],
	} as unknown as FullProduct;
	const feature = {
		id: "atomic-feature",
		internal_id: "atomic-feature-internal",
		org_id: "atomic-org",
		created_at: Date.now(),
		env: "sandbox",
		name: "Atomic Feature",
		type: "boolean",
		consumable: false,
		config: {},
		archived: false,
		event_names: [],
	} as Feature;
	spyOn(ProductService, "getFull").mockResolvedValue(fullProduct);
	spyOn(CusEntService, "hasAnyEntitlementReferences").mockResolvedValue(false);
	spyOn(CusPriceService, "hasAnyPriceReferences").mockResolvedValue(false);

	await expect(
		updateProductItems({
			ctx,
			db,
			fullProduct,
			newItems: [{ feature_id: feature.id }] as ProductItem[],
			features: [feature],
			useInPlaceEdit: false,
		}),
	).rejects.toBe(simulatedWriteFailure);

	expect(transactionInsertCalled).toBe(true);
});
