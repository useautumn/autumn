import type { LicenseBalanceResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeLicenseInventory } from "../../../licenseUtils.js";
import { planLicenseRepo } from "../../../repos/planLicenseRepo.js";
import type { CustomerLicenseState } from "../../reconcile/types.js";

type LicenseProduct = { internal_id: string; id: string; name: string | null };
type AssignmentRow = CustomerLicenseState["assignments"][number];

const poolKey = (parentCustomerProductId: string, licenseInternalId: string) =>
	`${parentCustomerProductId}:${licenseInternalId}`;

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
}): LicenseBalanceResponse => ({
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

export const buildLicenseBalances = async ({
	ctx,
	state,
	entityId,
}: {
	ctx: AutumnContext;
	state: CustomerLicenseState;
	entityId?: string;
}): Promise<LicenseBalanceResponse[]> => {
	const { parents, definitionsByParentId, assignments, balances } = state;

	const licenseInternalIds = [
		...new Set(
			[...definitionsByParentId.values()]
				.flat()
				.map((definition) => definition.license_internal_product_id),
		),
	];
	if (licenseInternalIds.length === 0) return [];

	const licenseProducts = await planLicenseRepo.listProductsByInternalIds({
		db: ctx.db,
		internalProductIds: licenseInternalIds,
	});
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
	const assignmentsByPool = groupAssignmentsByPool({ assignments, entityId });

	return parents.flatMap((parent) =>
		(definitionsByParentId.get(parent.id) ?? []).flatMap((definition) => {
			// A zero-capacity definition is a removal tombstone or an unoffered
			// link; there is nothing to list.
			if (definition.included <= 0) return [];
			const licenseProduct = licenseProductByInternalId.get(
				definition.license_internal_product_id,
			);
			if (!licenseProduct) return [];

			const key = poolKey(parent.id, definition.license_internal_product_id);
			const balance = balanceByKey.get(key);
			const granted = balance?.granted ?? definition.included;

			return [
				serializePool({
					parentPlanId: parent.product.id,
					licenseProduct,
					granted,
					assigned: granted - (balance?.remaining ?? granted),
					assignmentRows: assignmentsByPool.get(key) ?? [],
				}),
			];
		}),
	);
};
