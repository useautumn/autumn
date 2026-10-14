import {
	CusProductStatus,
	CustomerSchema,
	EntitySchema,
	FeatureType,
	FullCusProductSchema,
	type FullCustomerEntitlement,
	FullCustomerEntitlementSchema,
	type FullCustomerLicense,
	type FullSubject,
	type Invoice,
	isLiveLooseCustomerEntitlement,
	type Subscription,
} from "@autumn/shared";
import type { Catalog } from "../../models/catalog/catalog.js";
import { openSchema } from "../../models/common/openSchema.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import type {
	WorkerFullCustomerEntitlement,
	WorkerFullCustomerProduct,
} from "../../models/subject/workerFullSubject.js";
import {
	catalogToFreeTrial,
	catalogToFullPlanLicense,
} from "../catalogUtils/convertCatalogUtils.js";
import { subjectStateToFullSubject } from "../subjectUtils/convertSubjectUtils.js";

const fullCustomerEntitlementSchema = openSchema({
	name: "fullCustomerEntitlement",
	schema: FullCustomerEntitlementSchema,
});
const entitySchema = openSchema({ name: "entity", schema: EntitySchema });
const customerSchema = openSchema({ name: "customer", schema: CustomerSchema });
const fullCusProductSchema = openSchema({
	name: "fullCusProduct",
	schema: FullCusProductSchema,
});

const isPooledContributionSource = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}) => customerEntitlement.pooled_contribution_id != null;

const withoutExpiredRollovers = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
	now: number;
}) => ({
	...customerEntitlement,
	rollovers: customerEntitlement.rollovers.filter(
		(rollover) => rollover.expires_at === null || rollover.expires_at > now,
	),
});

const toFullCustomerEntitlement = ({
	customerEntitlement,
	now,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
	now: number;
}): FullCustomerEntitlement =>
	fullCustomerEntitlementSchema.parse(
		withoutExpiredRollovers({ customerEntitlement, now }),
	);

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

const compareCustomerProductsForRender = ({
	internalEntityId,
}: {
	internalEntityId: string | null;
}) => {
	const rank = (customerProduct: WorkerFullCustomerProduct) => [
		internalEntityId !== null &&
		customerProduct.internal_entity_id === internalEntityId
			? 0
			: 1,
		customerProduct.customer_prices.length > 0 ? 0 : 1,
		customerProduct.product.is_add_on ? 1 : 0,
		-customerProduct.created_at,
	];
	return (
		left: WorkerFullCustomerProduct,
		right: WorkerFullCustomerProduct,
	): number => {
		const leftRank = rank(left);
		const rightRank = rank(right);
		for (const [index, value] of leftRank.entries()) {
			const difference = value - (rightRank[index] ?? 0);
			if (difference !== 0) return difference;
		}
		return 0;
	};
};

const isBoolean = ({
	customerEntitlement,
}: {
	customerEntitlement: WorkerFullCustomerEntitlement;
}) => customerEntitlement.entitlement.feature.type === FeatureType.Boolean;

const flagPriorityOf = ({
	customerProductStatus,
}: {
	customerProductStatus: CusProductStatus | null;
}): number => {
	if (customerProductStatus === null) return 2;
	if (customerProductStatus === CusProductStatus.Active) return 0;
	if (customerProductStatus === CusProductStatus.PastDue) return 1;
	return 3;
};

const renderedFlagIdsOf = ({
	customerProducts,
	looseCustomerEntitlements,
}: {
	customerProducts: WorkerFullCustomerProduct[];
	looseCustomerEntitlements: WorkerFullCustomerEntitlement[];
}): Set<string> => {
	const winnerByFeatureId = new Map<string, { id: string; priority: number }>();
	const consider = ({
		customerEntitlement,
		priority,
	}: {
		customerEntitlement: WorkerFullCustomerEntitlement;
		priority: number;
	}) => {
		if (!isBoolean({ customerEntitlement })) return;
		if (isPooledContributionSource({ customerEntitlement })) return;
		const featureId = customerEntitlement.entitlement.feature.id;
		const winner = winnerByFeatureId.get(featureId);
		if (winner && winner.priority <= priority) return;
		winnerByFeatureId.set(featureId, { id: customerEntitlement.id, priority });
	};
	for (const customerProduct of customerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			consider({
				customerEntitlement,
				priority: flagPriorityOf({
					customerProductStatus: customerProduct.status,
				}),
			});
		}
	}
	for (const customerEntitlement of looseCustomerEntitlements) {
		consider({
			customerEntitlement,
			priority: flagPriorityOf({
				customerProductStatus: customerEntitlement.customer_product_id
					? CusProductStatus.Expired
					: null,
			}),
		});
	}
	return new Set([...winnerByFeatureId.values()].map(({ id }) => id));
};

const subjectEntityOf = ({
	state,
}: {
	state: SubjectState;
}): Pick<
	FullSubject,
	"subjectType" | "entityId" | "internalEntityId" | "entity"
> => {
	const { entityId } = state.identity;
	const entityKey = state.entity?.id ?? state.entity?.internal_id;
	if (!entityId || entityKey !== entityId) return { subjectType: "customer" };
	const entity = entitySchema.parse(state.entity);
	return {
		subjectType: "entity",
		entityId,
		internalEntityId: entity.internal_id,
		entity,
	};
};

export const workerStateToFullSubject = ({
	state,
	catalog,
	subscriptions,
	invoices,
	now = Date.now(),
}: {
	state: SubjectState;
	catalog: Catalog;
	subscriptions: Subscription[];
	invoices: Invoice[];
	now?: number;
}): FullSubject => {
	const workerFullSubject = subjectStateToFullSubject({
		state,
		catalog,
		entityId: state.identity.entityId,
	});
	const customer = customerSchema.parse(workerFullSubject.customer);

	const customerProducts = [...workerFullSubject.customer_products].sort(
		compareCustomerProductsForRender({
			internalEntityId: workerFullSubject.entity?.internal_id ?? null,
		}),
	);
	const looseCustomerEntitlements =
		workerFullSubject.extra_customer_entitlements.filter(
			(customerEntitlement) =>
				!isPooledContributionSource({ customerEntitlement }) &&
				isLiveLooseCustomerEntitlement({ customerEntitlement }),
		);
	const renderedFlagIds = renderedFlagIdsOf({
		customerProducts,
		looseCustomerEntitlements: [
			...looseCustomerEntitlements,
			...workerFullSubject.pooled_customer_entitlements,
		],
	});
	const isRendered = (customerEntitlement: WorkerFullCustomerEntitlement) =>
		!isBoolean({ customerEntitlement }) ||
		renderedFlagIds.has(customerEntitlement.id);

	return {
		...subjectEntityOf({ state }),
		customerId: state.identity.customerId,
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: customerProducts.map((customerProduct) =>
			fullCusProductSchema.parse({
				...customerProduct,
				free_trial: catalogToFreeTrial({
					catalog,
					freeTrialId: customerProduct.free_trial_id,
				}),
				customer_entitlements: customerProduct.customer_entitlements
					.filter(
						(customerEntitlement) =>
							!isPooledContributionSource({ customerEntitlement }) &&
							isRendered(customerEntitlement),
					)
					.map((customerEntitlement) =>
						withoutExpiredRollovers({ customerEntitlement, now }),
					),
				customer_licenses: customerLicensesOf({
					state,
					catalog,
					customerProductId: customerProduct.id,
				}),
			}),
		),
		extra_customer_entitlements: looseCustomerEntitlements
			.filter(isRendered)
			.map((customerEntitlement) =>
				toFullCustomerEntitlement({ customerEntitlement, now }),
			),
		pooled_customer_entitlements: workerFullSubject.pooled_customer_entitlements
			.filter(isRendered)
			.map((customerEntitlement) =>
				toFullCustomerEntitlement({ customerEntitlement, now }),
			),
		usage_windows: workerFullSubject.usage_windows,
		subscriptions,
		invoices,
	};
};
