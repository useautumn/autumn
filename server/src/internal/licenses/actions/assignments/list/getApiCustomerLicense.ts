import type { ApiCustomerLicenseV0 } from "@autumn/shared";
import { computeLicenseInventory } from "../../../licenseUtils.js";
import { offeredPools, poolKey } from "../../reconcile/stateHelpers.js";
import type { CustomerLicenseState } from "../../reconcile/types.js";

type LicenseProduct = { internal_id: string; id: string; name: string | null };
type AssignmentRow = CustomerLicenseState["assignments"][number];

const groupAssignmentsByPool = ({
	assignments,
	entityId,
}: {
	assignments: AssignmentRow[];
	entityId?: string;
}) => {
	const scoped = entityId
		? assignments.filter((row) => row.entity_id === entityId)
		: assignments;
	const byPool = new Map<string, AssignmentRow[]>();
	for (const row of scoped) {
		const key = poolKey(
			row.assignment.license_parent_customer_product_id ?? "",
			row.assignment.internal_product_id,
		);
		byPool.set(key, [...(byPool.get(key) ?? []), row]);
	}
	return byPool;
};

const serializePool = ({
	parentPlanId,
	licenseProduct,
	granted,
	assigned,
	assignmentRows,
}: {
	parentPlanId: string;
	licenseProduct: LicenseProduct;
	granted: number;
	assigned: number;
	assignmentRows: AssignmentRow[];
}): ApiCustomerLicenseV0 => ({
	parent_plan_id: parentPlanId,
	license_plan_id: licenseProduct.id,
	license_plan_name: licenseProduct.name ?? "",
	inventory: computeLicenseInventory({ included: granted, assigned }),
	assignments: assignmentRows.map(({ assignment, entity_id }) => ({
		assignment_id: assignment.id,
		entity_id: entity_id ?? "",
		license_plan_id: licenseProduct.id,
		started_at: assignment.created_at ?? 0,
	})),
});

/** Serializes a customer's license pools to the API shape. Pure — the caller
 * fetches the license products and passes them in. */
export const getApiCustomerLicense = ({
	state,
	licenseProducts,
	entityId,
}: {
	state: CustomerLicenseState;
	licenseProducts: LicenseProduct[];
	entityId?: string;
}): ApiCustomerLicenseV0[] => {
	const { parents, definitionsByParentId, balances } = state;

	const licenseProductByInternalId = new Map(
		licenseProducts.map((product) => [product.internal_id, product]),
	);
	const balanceByKey = new Map(
		balances.map((balance) => [
			poolKey(
				balance.parent_customer_product_id,
				balance.license_internal_product_id,
			),
			balance,
		]),
	);
	const assignmentsByPool = groupAssignmentsByPool({
		assignments: state.assignments,
		entityId,
	});

	const pools: ApiCustomerLicenseV0[] = [];
	for (const { parent, definition } of offeredPools({
		parents,
		definitionsByParentId,
	})) {
		const licenseProduct = licenseProductByInternalId.get(
			definition.license_internal_product_id,
		);
		if (!licenseProduct) continue;

		const key = poolKey(parent.id, definition.license_internal_product_id);
		const balance = balanceByKey.get(key);
		const granted = balance?.granted ?? definition.included;

		pools.push(
			serializePool({
				parentPlanId: parent.product.id,
				licenseProduct,
				granted,
				assigned: granted - (balance?.remaining ?? granted),
				assignmentRows: assignmentsByPool.get(key) ?? [],
			}),
		);
	}
	return pools;
};

/** The distinct license product internal ids a customer's state offers —
 * the fetch set the caller resolves before serializing. */
export const licenseProductInternalIds = (
	state: CustomerLicenseState,
): string[] => [
	...new Set(
		[...state.definitionsByParentId.values()]
			.flat()
			.map((definition) => definition.license_internal_product_id),
	),
];
