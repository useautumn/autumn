import {
	type Catalog,
	type SubjectState,
	subjectStateToFullSubject,
	type WorkerFullCustomerEntitlement,
} from "@autumn/balance-engine";
import {
	CustomerSchema,
	EntitySchema,
	FullCusProductSchema,
	type FullCustomerEntitlement,
	FullCustomerEntitlementSchema,
	type FullCustomerLicense,
	type FullSubject,
	type Invoice,
	type Subscription,
} from "@autumn/shared";
import { catalogToFullPlanLicense } from "./catalogToFullPlanLicense.js";

/** The worker holds no replaceables; the shared shape wants the list. */
const withReplaceables = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}) => ({ ...customerEntitlement, replaceables: [] });

const toFullCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}): FullCustomerEntitlement =>
	FullCustomerEntitlementSchema.parse(
		withReplaceables({ customerEntitlement }),
	);

/** A product's license pools as the worker holds them, each with its definition; a removed link keeps planLicense null. */
const customerLicensesOf = ({
	state,
	catalog,
	customerProductId,
}: {
	state: SubjectState;
	catalog: Catalog;
	customerProductId: string;
}): FullCustomerLicense[] =>
	state.customerLicenses
		.filter(
			({ parent_customer_product_id }) =>
				parent_customer_product_id === customerProductId,
		)
		.map((customerLicense) => ({
			...customerLicense,
			planLicense: customerLicense.plan_license_id
				? catalogToFullPlanLicense({
						catalog,
						planLicenseId: customerLicense.plan_license_id,
					})
				: null,
		}));

/** The entity view's own fields; a customer view has none. */
const subjectEntityOf = ({
	state,
}: {
	state: SubjectState;
}): Pick<
	FullSubject,
	"subjectType" | "entityId" | "internalEntityId" | "entity"
> => {
	const { entityId } = state.identity;
	if (!entityId || state.entity?.id !== entityId)
		return { subjectType: "customer" };
	const entity = EntitySchema.parse(state.entity);
	return {
		subjectType: "entity",
		entityId,
		internalEntityId: entity.internal_id,
		entity,
	};
};

/**
 * A subject as the worker holds it, in the shape `getApiCustomerV2` / `getApiEntityV2` render:
 * the customer's rows, plus the entity's own when the read named one.
 * Parsed, not cast: the worker's rows are whole only once hydrated since the widening.
 */
export const workerStateToFullSubject = ({
	state,
	catalog,
	subscriptions,
	invoices,
}: {
	state: SubjectState;
	catalog: Catalog;
	subscriptions: Subscription[];
	invoices: Invoice[];
}): FullSubject => {
	const workerFullSubject = subjectStateToFullSubject({
		state,
		catalog,
		entityId: state.identity.entityId,
	});
	const customer = CustomerSchema.parse(workerFullSubject.customer);

	return {
		...subjectEntityOf({ state }),
		customerId: state.identity.customerId,
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: workerFullSubject.customer_products.map(
			(customerProduct) =>
				FullCusProductSchema.parse({
					...customerProduct,
					customer_entitlements: customerProduct.customer_entitlements.map(
						(customerEntitlement) => withReplaceables({ customerEntitlement }),
					),
					customer_licenses: customerLicensesOf({
						state,
						catalog,
						customerProductId: customerProduct.id,
					}),
				}),
		),
		extra_customer_entitlements:
			workerFullSubject.extra_customer_entitlements.map((customerEntitlement) =>
				toFullCustomerEntitlement({ customerEntitlement }),
			),
		pooled_customer_entitlements:
			workerFullSubject.pooled_customer_entitlements.map(
				(customerEntitlement) =>
					toFullCustomerEntitlement({ customerEntitlement }),
			),
		usage_windows: workerFullSubject.usage_windows,
		subscriptions,
		invoices,
	};
};
