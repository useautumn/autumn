import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { productItemsHaveCustomerReferences } from "@/internal/product/actions/inPlaceUpdateUtils.js";
import { updateProductItems } from "@/internal/product/actions/updateProduct/updateProductItems.js";

afterEach(() => {
	mock.restore();
});

test("product item references: detects customer entitlements without direct customer products", async () => {
	const db = {} as DrizzleCli;
	const currentFullProduct = {
		entitlements: [{ id: "ent_cross_version" }],
		prices: [{ id: "price_unreferenced" }],
	} as FullProduct;
	const entitlementReferenceSpy = spyOn(
		CusEntService,
		"hasAnyEntitlementReferences",
	).mockResolvedValue(true);
	const priceReferenceSpy = spyOn(
		CusPriceService,
		"hasAnyPriceReferences",
	).mockResolvedValue(false);

	expect(
		await productItemsHaveCustomerReferences({ db, currentFullProduct }),
	).toBe(true);
	expect(entitlementReferenceSpy).toHaveBeenCalledWith({
		db,
		entitlementIds: ["ent_cross_version"],
	});
	expect(priceReferenceSpy).toHaveBeenCalledWith({
		db,
		priceIds: ["price_unreferenced"],
	});
});

test("product item references: detects customer prices without direct customer products", async () => {
	const db = {} as DrizzleCli;
	const currentFullProduct = {
		entitlements: [{ id: "ent_unreferenced" }],
		prices: [{ id: "price_cross_version" }],
	} as FullProduct;
	spyOn(CusEntService, "hasAnyEntitlementReferences").mockResolvedValue(false);
	spyOn(CusPriceService, "hasAnyPriceReferences").mockResolvedValue(true);

	expect(
		await productItemsHaveCustomerReferences({ db, currentFullProduct }),
	).toBe(true);
});

test("product item references: leaves unreferenced product items on the fast path", async () => {
	const db = {} as DrizzleCli;
	const currentFullProduct = {
		entitlements: [{ id: "ent_unreferenced" }],
		prices: [{ id: "price_unreferenced" }],
	} as FullProduct;
	spyOn(CusEntService, "hasAnyEntitlementReferences").mockResolvedValue(false);
	spyOn(CusPriceService, "hasAnyPriceReferences").mockResolvedValue(false);

	expect(
		await productItemsHaveCustomerReferences({ db, currentFullProduct }),
	).toBe(false);
});

test("product item references: locks rows before checking the fast path", async () => {
	const callOrder: string[] = [];
	const lockQuery = {
		from: () => ({
			where: () => ({
				orderBy: () => ({
					for: async () => {
						callOrder.push("lock");
					},
				}),
			}),
		}),
	};
	const db = {
		transaction: async (
			callback: (transaction: DrizzleCli) => Promise<void>,
		) => {
			callOrder.push("transaction");
			await callback(db as unknown as DrizzleCli);
		},
		select: () => lockQuery,
		delete: () => ({ where: async () => undefined }),
		query: { prices: { findMany: async () => [] } },
	} as unknown as DrizzleCli;
	const currentFullProduct = {
		id: "plan",
		internal_id: "plan_internal",
		org_id: "org",
		env: "sandbox",
		entitlements: [{ id: "entitlement" }],
		prices: [{ id: "price" }],
	} as FullProduct;
	const ctx = { org: { config: {} } } as AutumnContext;

	spyOn(CusEntService, "hasAnyEntitlementReferences").mockImplementation(
		async () => {
			callOrder.push("entitlement-check");
			return false;
		},
	);
	spyOn(CusPriceService, "hasAnyPriceReferences").mockImplementation(
		async () => {
			callOrder.push("price-check");
			return false;
		},
	);

	await updateProductItems({
		ctx,
		db,
		fullProduct: currentFullProduct,
		newItems: [],
		features: [],
		useInPlaceEdit: false,
	});

	expect(callOrder.slice(0, 5)).toEqual([
		"transaction",
		"lock",
		"lock",
		"entitlement-check",
		"price-check",
	]);
});
