import { beforeEach, expect, mock, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnBillingPlan } from "@autumn/shared";

type ActiveAssignment = {
	entityId: string;
	internalCustomerId: string;
	licenseInternalProductId: string;
	parentCustomerProductId: string;
};

const parentCustomerProductId = "customer_product_parent";
const parentInternalProductId = "product_parent_internal";
const licenseInternalProductId = "product_license_internal";
const licensePlanId = "license_plan";
const customerLicenseLinkId = "customer_license_link";

let activeAssignments: ActiveAssignment[] = [];
let fullCustomer: FullCustomer;
let executedPlans: AutumnBillingPlan[] = [];

const createFullCustomer = ({ remaining }: { remaining: number }) => {
	const licenseProduct = {
		id: licensePlanId,
		internal_id: licenseInternalProductId,
		archived: false,
	};
	const customerLicense = {
		id: "customer_license",
		link_id: customerLicenseLinkId,
		internal_customer_id: "customer_internal",
		parent_customer_product_id: parentCustomerProductId,
		license_internal_product_id: licenseInternalProductId,
		plan_license_id: "plan_license",
		granted: 2,
		remaining,
		paid_quantity: 0,
		created_at: 1,
		updated_at: 1,
		planLicense: {
			id: "plan_license",
			parent_internal_product_id: parentInternalProductId,
			license_internal_product_id: licenseInternalProductId,
			is_custom: false,
			included: 2,
			prepaid_only: true,
			customized: false,
			metadata: null,
			created_at: 1,
			updated_at: 1,
			product: licenseProduct,
		},
	};
	const parentCustomerProduct = {
		id: parentCustomerProductId,
		internal_customer_id: "customer_internal",
		internal_product_id: parentInternalProductId,
		internal_entity_id: null,
		customer_license_link_id: null,
		status: CusProductStatus.Active,
		product: { id: "parent_plan", internal_id: parentInternalProductId },
		customer_licenses: [customerLicense],
		customer_entitlements: [],
		customer_prices: [],
	};

	return {
		id: "customer",
		internal_id: "customer_internal",
		customer_products: [parentCustomerProduct],
		entities: [
			{
				id: "entity_existing_assignment",
				internal_id: "entity_existing_assignment_internal",
				feature_id: "users",
			},
			{
				id: "entity_pending_assignment",
				internal_id: "entity_pending_assignment_internal",
				feature_id: "users",
			},
		],
	} as unknown as FullCustomer;
};

mock.module(
	"@/internal/billing/v2/setup/setupFullCustomerContext.js",
	() => ({ setupFullCustomerContext: mock(async () => fullCustomer) }),
);
mock.module(
	"@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext.js",
	() => ({
		setupStripeBillingContext: mock(async () => ({
			stripeSubscription: undefined,
			testClockFrozenTime: undefined,
		})),
	}),
);
mock.module(
	"@/internal/billing/v2/setup/setupBillingCycleAnchor.js",
	() => ({ setupBillingCycleAnchor: mock(() => 1) }),
);
mock.module(
	"@/internal/billing/v2/setup/setupResetCycleAnchor.js",
	() => ({ setupResetCycleAnchor: mock(() => 1) }),
);
mock.module("@/internal/licenses/repos/licenseAssignmentRepo.js", () => ({
	licenseAssignmentRepo: {
		listAssignmentsWithEntityAndProductByCustomer: mock(
			async ({
				internalCustomerId,
				licenseInternalProductId: requestedLicenseInternalProductId,
				parentCustomerProductId: requestedParentCustomerProductId,
			}: {
				internalCustomerId: string;
				licenseInternalProductId: string;
				parentCustomerProductId: string;
			}) =>
				activeAssignments
					.filter(
						(assignment) =>
							assignment.internalCustomerId === internalCustomerId &&
							assignment.licenseInternalProductId ===
								requestedLicenseInternalProductId &&
							assignment.parentCustomerProductId ===
								requestedParentCustomerProductId,
					)
					.map((assignment) => ({
						assignment: { id: `assignment_${assignment.entityId}` },
						entity_id: assignment.entityId,
						license_product_id: licensePlanId,
					})),
		),
		listUnusedAssignmentsByLinkId: mock(async () => []),
	},
}));
mock.module(
	"@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js",
	() => ({
		initFullCustomerProductFromCustomerLicense: mock(
			({ internalEntityId }: { internalEntityId: string }) =>
				({
					id: `assignment_${internalEntityId}`,
					internal_customer_id: "customer_internal",
					internal_product_id: licenseInternalProductId,
					internal_entity_id: internalEntityId,
					customer_license_link_id: customerLicenseLinkId,
					status: CusProductStatus.Active,
					customer_entitlements: [],
					customer_prices: [],
					product: { id: licensePlanId },
				}) as unknown as FullCusProduct,
		),
	}),
);
mock.module(
	"@/internal/billing/v2/pooledBalances/compute/extractPooledBalanceOps.js",
	() => ({
		extractPooledBalanceOps: mock(
			({ customerProduct }: { customerProduct: FullCusProduct }) => ({
				customerProduct,
				pooledBalanceOps: [],
			}),
		),
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: mock(
			async ({ autumnBillingPlan }: { autumnBillingPlan: AutumnBillingPlan }) => {
				executedPlans.push(autumnBillingPlan);
			},
		),
	}),
);
mock.module(
	"@/internal/billing/v2/actions/attachLicense/logs/logLicenseAssignmentPlan.js",
	() => ({ logLicenseAssignmentPlan: mock(() => {}) }),
);

const { attachLicense } = await import(
	// @ts-expect-error - Bun test cache-busting import isolates module mocks.
	"@/internal/billing/v2/actions/attachLicense/attachLicense.js?attachLicenseIdempotency"
);

const attach = ({ entityIds }: { entityIds: string[] }) =>
	attachLicense({
		ctx: { db: {} } as never,
		params: {
			customer_id: "customer",
			plan_id: licensePlanId,
			entities: entityIds.map((entityId) => ({ entity_id: entityId })),
		},
	});

beforeEach(() => {
	activeAssignments = [];
	fullCustomer = createFullCustomer({ remaining: 2 });
	executedPlans = [];
});

test("an already fulfilled assignment succeeds with zero remaining capacity", async () => {
	fullCustomer = createFullCustomer({ remaining: 0 });
	activeAssignments = [
		{
			entityId: "entity_existing_assignment",
			internalCustomerId: "customer_internal",
			licenseInternalProductId,
			parentCustomerProductId,
		},
	];

	await expect(
		attach({ entityIds: ["entity_existing_assignment"] }),
	).resolves.toEqual({ success: true });
	expect(executedPlans).toHaveLength(0);
});

test("a mixed fulfilled and pending request consumes exactly one assignment", async () => {
	fullCustomer = createFullCustomer({ remaining: 1 });
	activeAssignments = [
		{
			entityId: "entity_existing_assignment",
			internalCustomerId: "customer_internal",
			licenseInternalProductId,
			parentCustomerProductId,
		},
	];

	await attach({
		entityIds: [
			"entity_existing_assignment",
			"entity_pending_assignment",
		],
	});

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0].customerLicenseUpdates).toEqual([
		{
			customerLicenseId: "customer_license",
			remainingChange: -1,
		},
	]);
	expect(executedPlans[0].insertCustomerProducts).toHaveLength(1);
});

test("an assignment for a different license does not suppress the requested license", async () => {
	fullCustomer = createFullCustomer({ remaining: 1 });
	activeAssignments = [
		{
			entityId: "entity_existing_assignment",
			internalCustomerId: "customer_internal",
			licenseInternalProductId: "different_license_internal",
			parentCustomerProductId,
		},
	];

	await attach({ entityIds: ["entity_existing_assignment"] });

	expect(executedPlans).toHaveLength(1);
	expect(executedPlans[0].customerLicenseUpdates?.[0]?.remainingChange).toBe(-1);
	expect(executedPlans[0].insertCustomerProducts).toHaveLength(1);
});

test("duplicate entity ids in one request remain invalid", async () => {
	fullCustomer = createFullCustomer({ remaining: 0 });
	activeAssignments = [
		{
			entityId: "entity_existing_assignment",
			internalCustomerId: "customer_internal",
			licenseInternalProductId,
			parentCustomerProductId,
		},
	];

	await expect(
		attach({
			entityIds: [
				"entity_existing_assignment",
				"entity_existing_assignment",
			],
		}),
	).rejects.toThrow("Duplicate entity entity_existing_assignment in entities.");
	expect(executedPlans).toHaveLength(0);
});
