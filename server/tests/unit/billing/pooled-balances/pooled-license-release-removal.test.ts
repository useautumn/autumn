import { expect, test } from "bun:test";
import { CusProductStatus, EntInterval } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { entitlements } from "@tests/utils/fixtures/db/entitlements.js";
import { computeReleaseLicensePlan } from "@/internal/billing/v2/actions/releaseLicense/compute/computeReleaseLicensePlan.js";

const createAssignment = ({ status }: { status: CusProductStatus }) => {
	const entitlement = {
		...entitlements.create({
			id: "pooled_entitlement",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			interval: EntInterval.Month,
		}),
		pooled: true,
	};
	const customerEntitlement = customerEntitlements.create({
		id: "pooled_customer_entitlement",
		entitlementId: entitlement.id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance: 0,
		customerProductId: "assignment",
	});
	customerEntitlement.entitlement = entitlement;

	return customerProducts.create({
		id: "assignment",
		status,
		internalEntityId: "internal_entity",
		entityId: "entity",
		customerEntitlements: [customerEntitlement],
	});
};

const computePlan = ({ status }: { status: CusProductStatus }) => {
	const assignment = createAssignment({ status });
	return computeReleaseLicensePlan({
		context: {
			fullCustomer: { id: "customer", internal_id: "internal_customer" },
			entityIds: ["entity"],
			releases: [
				{
					assignment,
					entity: { id: "entity", internal_id: "internal_entity" },
					customerLicense: { link_id: "customer_license_link" },
				},
			],
		} as never,
	}).billingPlan;
};

test("releasing an active pooled license assignment removes its contribution", () => {
	expect(
		computePlan({ status: CusProductStatus.Active }).pooledBalanceOps,
	).toEqual([
		expect.objectContaining({
			op: "remove_source",
			sourceCustomerProductId: "assignment",
		}),
	]);
});

test("releasing a scheduled pooled license assignment does not remove a contribution that never started", () => {
	expect(
		computePlan({ status: CusProductStatus.Scheduled }).pooledBalanceOps,
	).toEqual([]);
});
