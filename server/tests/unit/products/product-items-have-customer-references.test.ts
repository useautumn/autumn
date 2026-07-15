import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { FullProduct } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { CusPriceService } from "@/internal/customers/cusProducts/cusPrices/CusPriceService.js";
import { productItemsHaveCustomerReferences } from "@/internal/product/actions/inPlaceUpdateUtils.js";

afterEach(() => {
	mock.restore();
});

test.concurrent(
	"product item references: detects customer entitlements without direct customer products",
	async () => {
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
	},
);

test.concurrent(
	"product item references: detects customer prices without direct customer products",
	async () => {
		const db = {} as DrizzleCli;
		const currentFullProduct = {
			entitlements: [{ id: "ent_unreferenced" }],
			prices: [{ id: "price_cross_version" }],
		} as FullProduct;
		spyOn(CusEntService, "hasAnyEntitlementReferences").mockResolvedValue(
			false,
		);
		spyOn(CusPriceService, "hasAnyPriceReferences").mockResolvedValue(true);

		expect(
			await productItemsHaveCustomerReferences({ db, currentFullProduct }),
		).toBe(true);
	},
);

test.concurrent(
	"product item references: leaves unreferenced product items on the fast path",
	async () => {
		const db = {} as DrizzleCli;
		const currentFullProduct = {
			entitlements: [{ id: "ent_unreferenced" }],
			prices: [{ id: "price_unreferenced" }],
		} as FullProduct;
		spyOn(CusEntService, "hasAnyEntitlementReferences").mockResolvedValue(
			false,
		);
		spyOn(CusPriceService, "hasAnyPriceReferences").mockResolvedValue(false);

		expect(
			await productItemsHaveCustomerReferences({ db, currentFullProduct }),
		).toBe(false);
	},
);
