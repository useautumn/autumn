import { beforeEach, expect, mock, test } from "bun:test";
import {
	type AutumnBillingPlan,
	CusProductStatus,
	EntInterval,
	type Entity,
	type FullCusProduct,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";

let executedPlans: AutumnBillingPlan[] = [];
let canceledCustomerProductIds: string[] = [];
let endedLicenseEntityIds: string[] = [];

mock.module(
	"@/internal/billing/v2/execute/executeAutumnBillingPlan.js",
	() => ({
		executeAutumnBillingPlan: async ({
			autumnBillingPlan,
		}: {
			autumnBillingPlan: AutumnBillingPlan;
		}) => {
			executedPlans.push(autumnBillingPlan);
		},
	}),
);

mock.module("@/internal/billing/v2/actions", () => ({
	billingActions: {
		updateSubscription: async ({
			params,
		}: {
			params: { customer_product_id: string };
		}) => {
			canceledCustomerProductIds.push(params.customer_product_id);
		},
	},
}));

mock.module(
	"@/internal/licenses/actions/assignments/utils/releaseLicenseAssignmentsForEntity.js",
	() => ({
		releaseLicenseAssignmentsForEntity: async ({
			internalEntityId,
		}: {
			internalEntityId: string;
		}) => {
			endedLicenseEntityIds.push(internalEntityId);
		},
	}),
);

const { cancelSubsForEntity } = await import(
	"@/internal/entities/actions/deleteEntity/cancelEntitySubscriptions.js"
);

const internalEntityId = "internal_entity_delete";

const createPooledCustomerProduct = ({
	id,
	status = CusProductStatus.Active,
	paid = false,
	license = false,
}: {
	id: string;
	status?: CusProductStatus;
	paid?: boolean;
	license?: boolean;
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		id: `customer_entitlement_${id}`,
		entitlementId: `entitlement_${id}`,
		featureId: "messages",
		featureName: "Messages",
		allowance: 500,
		balance: 0,
		customerProductId: id,
		interval: EntInterval.Month,
	});
	customerEntitlement.entitlement = {
		...customerEntitlement.entitlement,
		pooled: true,
	};

	const fixedPrice = prices.createFixed({ id: `price_${id}` });
	const customerProduct = customerProducts.create({
		id,
		productId: `product_${id}`,
		customerEntitlements: [customerEntitlement],
		customerPrices: paid
			? [prices.createCustomer({ price: fixedPrice, customerProductId: id })]
			: [],
		internalEntityId,
		entityId: "entity_delete",
		status,
	});

	return license
		? {
				...customerProduct,
				customer_license_link_id: "license_link",
			}
		: customerProduct;
};

beforeEach(() => {
	executedPlans = [];
	canceledCustomerProductIds = [];
	endedLicenseEntityIds = [];
});

test("entity deletion delegates each pooled source to exactly one lifecycle owner", async () => {
	const licenseCustomerProduct = createPooledCustomerProduct({
		id: "entity_delete_license",
		license: true,
	});
	const paidCustomerProduct = createPooledCustomerProduct({
		id: "entity_delete_paid",
		paid: true,
	});
	const scheduledCustomerProduct = createPooledCustomerProduct({
		id: "entity_delete_scheduled",
		status: CusProductStatus.Scheduled,
	});
	const freeCustomerProduct = createPooledCustomerProduct({
		id: "entity_delete_free",
	});
	const expiredCustomerProduct = createPooledCustomerProduct({
		id: "entity_delete_expired",
		status: CusProductStatus.Expired,
	});
	const fullCustomer = customers.create({
		customerProducts: [
			licenseCustomerProduct,
			paidCustomerProduct,
			scheduledCustomerProduct,
			freeCustomerProduct,
			expiredCustomerProduct,
		],
	});
	const entity = {
		id: "entity_delete",
		internal_id: internalEntityId,
	} as Entity;

	await cancelSubsForEntity({ ctx: {} as never, fullCustomer, entity });

	expect(endedLicenseEntityIds).toEqual([internalEntityId]);
	expect(canceledCustomerProductIds).toEqual([paidCustomerProduct.id]);
	expect(executedPlans).toHaveLength(2);

	const freeExpiryPlan = executedPlans.find((plan) =>
		plan.updateCustomerProducts?.some(
			({ customerProduct }) => customerProduct.id === freeCustomerProduct.id,
		),
	);
	expect(freeExpiryPlan?.updateCustomerProducts).toEqual([
		expect.objectContaining({
			customerProduct: freeCustomerProduct,
			updates: expect.objectContaining({
				status: CusProductStatus.Expired,
				ended_at: expect.any(Number),
			}),
		}),
	]);
	expect(freeExpiryPlan?.pooledBalanceOps).toEqual([
		{
			op: "remove_source",
			internalCustomerId: freeCustomerProduct.internal_customer_id,
			sourceCustomerProductId: freeCustomerProduct.id,
			effectiveAt: null,
		},
	]);

	const scheduledDeletionPlan = executedPlans.find((plan) =>
		plan.deleteCustomerProducts?.some(
			(customerProduct) => customerProduct.id === scheduledCustomerProduct.id,
		),
	);
	expect(scheduledDeletionPlan?.deleteCustomerProducts).toEqual([
		scheduledCustomerProduct,
	]);

	const explicitlyOwnedSourceIds = executedPlans.flatMap(
		(plan) =>
			plan.pooledBalanceOps?.flatMap((operation) =>
				"sourceCustomerProductId" in operation
					? [operation.sourceCustomerProductId]
					: [],
			) ?? [],
	);
	expect(explicitlyOwnedSourceIds).toEqual([freeCustomerProduct.id]);
});
