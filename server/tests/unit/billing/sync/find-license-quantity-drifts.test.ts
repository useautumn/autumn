import { expect, test } from "bun:test";
import type {
	FullCusProduct,
	FullCustomerLicense,
	SyncPlanInstance,
} from "@autumn/shared";
import { findLicenseQuantityDrifts } from "@/internal/billing/v2/actions/sync/scope/findLicenseQuantityDrifts";

const pool = ({
	licensePlanId,
	granted,
}: {
	licensePlanId: string;
	granted: number;
}): FullCustomerLicense =>
	({
		id: `cus_lic_${licensePlanId}`,
		link_id: `link_${licensePlanId}`,
		granted,
		remaining: granted,
		paid_quantity: granted - 1,
		planLicense: { product: { id: licensePlanId } },
	}) as unknown as FullCustomerLicense;

const parentWithPools = (pools: FullCustomerLicense[]): FullCusProduct =>
	({ customer_licenses: pools }) as unknown as FullCusProduct;

const syncPlanWithLicenses = (
	licenseQuantities: { license_plan_id: string; quantity: number }[],
): SyncPlanInstance =>
	({
		plan_id: "parent",
		license_quantities: licenseQuantities,
	}) as SyncPlanInstance;

test("no drift when pool granted equals the desired total", () => {
	const drifts = findLicenseQuantityDrifts({
		linkedCustomerProduct: parentWithPools([
			pool({ licensePlanId: "dev-seat", granted: 4 }),
		]),
		syncPlan: syncPlanWithLicenses([
			{ license_plan_id: "dev-seat", quantity: 4 },
		]),
	});
	expect(drifts).toEqual([]);
});

test("increment drift reports the pool with the desired total", () => {
	const drifts = findLicenseQuantityDrifts({
		linkedCustomerProduct: parentWithPools([
			pool({ licensePlanId: "dev-seat", granted: 4 }),
		]),
		syncPlan: syncPlanWithLicenses([
			{ license_plan_id: "dev-seat", quantity: 5 },
		]),
	});
	expect(drifts).toHaveLength(1);
	expect(drifts[0]?.customerLicense.link_id).toBe("link_dev-seat");
	expect(drifts[0]?.totalQuantity).toBe(5);
});

test("decrement drift reports the pool with the desired total", () => {
	const drifts = findLicenseQuantityDrifts({
		linkedCustomerProduct: parentWithPools([
			pool({ licensePlanId: "dev-seat", granted: 4 }),
		]),
		syncPlan: syncPlanWithLicenses([
			{ license_plan_id: "dev-seat", quantity: 3 },
		]),
	});
	expect(drifts).toHaveLength(1);
	expect(drifts[0]?.totalQuantity).toBe(3);
});

test("license entry with no existing pool is ignored (pool creation is not a quantity drift)", () => {
	const drifts = findLicenseQuantityDrifts({
		linkedCustomerProduct: parentWithPools([]),
		syncPlan: syncPlanWithLicenses([
			{ license_plan_id: "dev-seat", quantity: 3 },
		]),
	});
	expect(drifts).toEqual([]);
});

test("only drifted pools are reported when several licenses are present", () => {
	const drifts = findLicenseQuantityDrifts({
		linkedCustomerProduct: parentWithPools([
			pool({ licensePlanId: "dev-seat", granted: 4 }),
			pool({ licensePlanId: "analyst-seat", granted: 2 }),
		]),
		syncPlan: syncPlanWithLicenses([
			{ license_plan_id: "dev-seat", quantity: 4 },
			{ license_plan_id: "analyst-seat", quantity: 6 },
		]),
	});
	expect(drifts).toHaveLength(1);
	expect(drifts[0]?.customerLicense.link_id).toBe("link_analyst-seat");
	expect(drifts[0]?.totalQuantity).toBe(6);
});
