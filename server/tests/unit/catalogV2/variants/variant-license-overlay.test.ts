import { describe, expect, test } from "bun:test";
import type { FullPlanLicense, FullProduct } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { buildVariantEditDiff } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/editDiff/buildVariantEditDiff";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

/**
 * A variant whose overlay swaps the base's license link for its own: the
 * read side must state the swap as customize, and the diff side must not
 * re-add the base's link on an unchanged config.
 */

const planLicense = ({
	parent,
	licenseProduct,
	included = 1,
}: {
	parent: FullProduct;
	licenseProduct: FullProduct;
	included?: number;
}): FullPlanLicense => ({
	id: `license_${parent.id}_${licenseProduct.id}`,
	parent_internal_product_id: parent.internal_id,
	is_custom: false,
	license_internal_product_id: licenseProduct.internal_id,
	included,
	prepaid_only: true,
	customized: false,
	metadata: null,
	created_at: 1,
	updated_at: 1,
	product: licenseProduct,
});

const seat = products.createFull({ id: "seat", name: "Seat" });
const seatAnnual = products.createFull({
	id: "seat_annual",
	name: "Seat (annual)",
});

const pro: FullProduct = {
	...products.createFull({ id: "pro", name: "Pro" }),
	licenses: [],
};
pro.licenses = [planLicense({ parent: pro, licenseProduct: seat })];

const proAnnual: FullProduct = {
	...products.createFull({ id: "pro_annual", name: "Pro (annual)" }),
	base_internal_product_id: pro.internal_id,
	licenses: [],
};
proAnnual.licenses = [
	planLicense({ parent: proAnnual, licenseProduct: seatAnnual }),
];

const declaredProLicenses = [{ license_plan_id: "seat", included: 1 }];

const swapSeatOverlay = {
	remove_licenses: [{ license_plan_id: "seat" }],
	upsert_licenses: [{ license_plan_id: "seat_annual", included: 1 }],
};

describe("variant license overlay — read side", () => {
	test("variants[].customize states remove_licenses / upsert_licenses relative to the base", async () => {
		const plan = await getPlanResponse({
			product: { ...pro, variants: [proAnnual] },
			features: [],
			expandLicensePlans: true,
			expandVariants: true,
			resolveBaseFullProduct: false,
		});

		expect(plan.variants?.[0]?.customize).toEqual({
			remove_licenses: [{ license_plan_id: "seat" }],
			upsert_licenses: [
				{
					license_plan_id: "seat_annual",
					version_slug: "v1",
					included: 1,
					prepaid_only: true,
				},
			],
		});
	});

	test("a variant sharing the base's links carries no license lane", async () => {
		const sameLinks: FullProduct = {
			...proAnnual,
			licenses: [planLicense({ parent: proAnnual, licenseProduct: seat })],
		};
		const plan = await getPlanResponse({
			product: { ...pro, variants: [sameLinks] },
			features: [],
			expandLicensePlans: true,
			expandVariants: true,
			resolveBaseFullProduct: false,
		});

		expect(plan.variants?.[0]?.customize).toBeUndefined();
	});
});

describe("variant license overlay — diff side", () => {
	test("unchanged config: declared overlay over the base's licenses[] is a no-op edit", () => {
		expect(
			buildVariantEditDiff({
				variantProduct: proAnnual,
				baseCurrent: pro,
				baseNext: pro,
				follow: true,
				customize: swapSeatOverlay,
				declaredLicenses: declaredProLicenses,
			}),
		).toBeUndefined();
	});

	test("first push of the overlay onto a variant still linked to seat: remove seat, add seat_annual", () => {
		const stillOnSeat: FullProduct = {
			...proAnnual,
			licenses: [planLicense({ parent: proAnnual, licenseProduct: seat })],
		};

		expect(
			buildVariantEditDiff({
				variantProduct: stillOnSeat,
				baseCurrent: pro,
				baseNext: pro,
				follow: true,
				customize: swapSeatOverlay,
				declaredLicenses: declaredProLicenses,
			}),
		).toEqual({
			remove_licenses: [{ license_plan_id: "seat" }],
			upsert_licenses: [
				{ license_plan_id: "seat_annual", included: 1, prepaid_only: true },
			],
		});
	});
});
