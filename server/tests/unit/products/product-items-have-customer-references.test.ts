import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";
import { productItemsHaveCustomerReferences } from "@/internal/product/actions/inPlaceUpdateUtils.js";
import { updateProductItems } from "@/internal/product/actions/updateProduct/updateProductItems.js";
import { ProductService } from "@/internal/products/ProductService.js";

afterEach(() => {
	mock.restore();
});

const mockNoLicenseItemReferences = () => {
	spyOn(licenseItemRepo, "listReferencedPriceIds").mockResolvedValue(new Set());
	spyOn(licenseItemRepo, "listReferencedEntitlementIds").mockResolvedValue(
		new Set(),
	);
};

test("product item references: detects customer entitlements without direct customer products", async () => {
	mockNoLicenseItemReferences();
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
	mockNoLicenseItemReferences();
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
	mockNoLicenseItemReferences();
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

test("product item references: reloads current rows under the product lock", async () => {
	const callOrder: string[] = [];
	let selectCount = 0;
	const transactionDb = {
		select: () => {
			selectCount += 1;
			const lockName =
				selectCount === 1
					? "product-lock"
					: selectCount === 2
						? "entitlement-lock"
						: "price-lock";
			const lock = async (strength: string) => {
				callOrder.push(`${lockName}:${strength}`);
			};
			return {
				from: () => ({
					where: () => ({
						for: lock,
						orderBy: () => ({ for: lock }),
					}),
				}),
			};
		},
		delete: () => ({ where: async () => undefined }),
		query: { prices: { findMany: async () => [] } },
	} as unknown as DrizzleCli;
	const db = {
		transaction: async (
			callback: (transaction: DrizzleCli) => Promise<void>,
		) => {
			callOrder.push("transaction");
			await callback(transactionDb);
		},
	} as unknown as DrizzleCli;
	const currentFullProduct = {
		id: "plan",
		internal_id: "plan_internal",
		org_id: "org",
		env: "sandbox",
		version: 1,
		entitlements: [{ id: "stale-entitlement" }],
		prices: [{ id: "stale-price" }],
	} as FullProduct;
	const refreshedFullProduct = {
		...currentFullProduct,
		entitlements: [{ id: "current-entitlement" }],
		prices: [{ id: "current-price" }],
	} as FullProduct;
	const ctx = { org: { config: {} } } as AutumnContext;
	const reloadSpy = spyOn(ProductService, "getFull").mockImplementation(
		async () => {
			callOrder.push("reload");
			return refreshedFullProduct;
		},
	);

	const entitlementReferenceSpy = spyOn(
		CusEntService,
		"hasAnyEntitlementReferences",
	).mockImplementation(async () => {
		callOrder.push("entitlement-check");
		return false;
	});
	spyOn(
		planLicenseRepo,
		"listCatalogByLicenseInternalProductIds",
	).mockResolvedValue([]);
	spyOn(
		planLicenseRepo,
		"listCustomerReferencedByLicenseInternalProductIds",
	).mockResolvedValue([]);
	mockNoLicenseItemReferences();
	const priceReferenceSpy = spyOn(
		CusPriceService,
		"hasAnyPriceReferences",
	).mockImplementation(async () => {
		callOrder.push("price-check");
		return false;
	});

	await updateProductItems({
		ctx,
		db,
		fullProduct: currentFullProduct,
		newItems: [],
		features: [],
		useInPlaceEdit: false,
	});

	expect(callOrder.slice(0, 7)).toEqual([
		"transaction",
		"product-lock:no key update",
		"reload",
		"entitlement-lock:update",
		"price-lock:update",
		"entitlement-check",
		"price-check",
	]);
	expect(reloadSpy).toHaveBeenCalledWith({
		db: transactionDb,
		idOrInternalId: "plan_internal",
		orgId: "org",
		env: "sandbox",
		version: 1,
	});
	expect(entitlementReferenceSpy).toHaveBeenCalledWith({
		db: transactionDb,
		entitlementIds: ["current-entitlement"],
	});
	expect(priceReferenceSpy).toHaveBeenCalledWith({
		db: transactionDb,
		priceIds: ["current-price"],
	});
});
