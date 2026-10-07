import { describe, expect, test } from "bun:test";
import type { FullPlanLicense, FullProduct } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { buildPlanLicenseChanges } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/buildPlanLicenseChanges";
import { resolveDeclaredPlanLicenses } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/declared/resolveDeclaredPlanLicenses";
import { computePlanLicenseRowPlan } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/row/computePlanLicenseRowPlan";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";

/**
 * A license plan renamed by internalId keeps its internal row, so the
 * parent's link to it is the same (parent, license) pair: never add + remove.
 */

const seat = products.createFull({ id: "seat", name: "Seat" });
const seatNew: FullProduct = { ...seat, id: "seatNew" };
const enterprise = products.createFull({ id: "enterprise", name: "Ent" });

const seatLink = ({ product }: { product: FullProduct }): FullPlanLicense => ({
	id: "plan_lic_enterprise_seat",
	parent_internal_product_id: enterprise.internal_id,
	is_custom: false,
	license_internal_product_id: seat.internal_id,
	included: 25,
	prepaid_only: true,
	customized: false,
	metadata: null,
	created_at: 1,
	updated_at: 1,
	product,
});

const projectedContext = buildProductStatesContext({
	planIds: ["seat", "seatNew", "enterprise"],
	versionsByPlanId: new Map([
		["seat", []],
		["seatNew", [seatNew]],
		["enterprise", [enterprise]],
	]),
	usageByInternalId: new Map(),
	rewardProgramsByPlanId: new Map(),
});

describe("renamed license plan — link diff", () => {
	test("declaring the new id keeps the existing link row", () => {
		const planned = resolveDeclaredPlanLicenses({
			declared: [
				{ license_plan_id: "seatNew", version_slug: "v1", included: 25 },
			],
			currentLicenses: [seatLink({ product: seat })],
			productStatesContext: projectedContext,
		});

		expect(planned.map((plan) => plan.op)).toEqual(["none"]);
		expect(planned[0]?.currentPlanLicense?.id).toBe("plan_lic_enterprise_seat");

		const rowPlan = computePlanLicenseRowPlan({
			planLicense: planned[0]!,
			parentInternalProductId: enterprise.internal_id,
			referencedPlanLicenseIds: new Set(),
		});
		expect(rowPlan).toBeUndefined();
	});

	test("an included change on the renamed link updates the same row", () => {
		const planned = resolveDeclaredPlanLicenses({
			declared: [
				{ license_plan_id: "seatNew", version_slug: "v1", included: 30 },
			],
			currentLicenses: [seatLink({ product: seat })],
			productStatesContext: projectedContext,
		});

		expect(planned.map((plan) => plan.op)).toEqual(["update"]);
		const rowPlan = computePlanLicenseRowPlan({
			planLicense: planned[0]!,
			parentInternalProductId: enterprise.internal_id,
			referencedPlanLicenseIds: new Set(),
		});
		expect(rowPlan?.row?.id).toBe("plan_lic_enterprise_seat");
		expect(rowPlan?.deletePlanLicenseId).toBeUndefined();
	});

	test("preview pairs the renamed link instead of + new / - old", () => {
		const { licenseChanges } = buildPlanLicenseChanges({
			fromLicenses: [seatLink({ product: seat })],
			toLicenses: [seatLink({ product: seatNew })],
		});

		expect(
			licenseChanges.filter((change) => change.action !== "updated"),
		).toEqual([]);
	});
});
