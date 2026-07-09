import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { computeLicenseInventory } from "../../../licenseUtils.js";
import { planLicenseRepo } from "../../../repos/planLicenseRepo.js";
import { reconcileLicenseStateForCustomer } from "../../reconcile/reconcileLicenseState.js";

export const listLicenses = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}) => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId, entity_id: entityId },
	});

	const state = await reconcileLicenseStateForCustomer({
		ctx,
		customerId,
		fullCustomer,
	});
	if (!state) return [];

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
			`${balance.parent_customer_product_id}:${balance.license_internal_product_id}`,
			balance,
		]),
	);
	const scopedAssignments = entityId
		? assignments.filter((row) => row.entity_id === entityId)
		: assignments;
	const assignmentsByKey = new Map<string, typeof assignments>();
	for (const row of scopedAssignments) {
		const key = `${row.assignment.license_parent_customer_product_id}:${row.assignment.internal_product_id}`;
		const rows = assignmentsByKey.get(key) ?? [];
		rows.push(row);
		assignmentsByKey.set(key, rows);
	}

	return parents.flatMap((parent) =>
		(definitionsByParentId.get(parent.id) ?? []).flatMap((definition) => {
			// A zero-capacity definition is a removal tombstone or an unoffered
			// link; either way there is nothing to list.
			if (definition.included <= 0) return [];
			const licenseProduct = licenseProductByInternalId.get(
				definition.license_internal_product_id,
			);
			if (!licenseProduct) return [];

			const key = `${parent.id}:${definition.license_internal_product_id}`;
			const balance = balanceByKey.get(key);
			const rows = assignmentsByKey.get(key) ?? [];
			const granted = balance?.granted ?? definition.included;
			const assigned = granted - (balance?.remaining ?? granted);

			return [
				{
					parent_plan_id: parent.product.id,
					license_plan_id: licenseProduct.id,
					license_plan_name: licenseProduct.name,
					inventory: computeLicenseInventory({
						included: granted,
						assigned,
					}),
					assignments: rows.map(({ assignment, entity_id }) => ({
						assignment_id: assignment.id,
						entity_id: entity_id ?? "",
						license_plan_id: licenseProduct.id,
						started_at: assignment.created_at,
					})),
				},
			];
		}),
	);
};
