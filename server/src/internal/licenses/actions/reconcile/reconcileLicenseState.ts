import type { FullCusProduct, FullCustomer, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	getFullLicenseProduct,
	isLicenseParentCustomerProduct,
} from "../../licenseUtils.js";
import { customerLicenseRepo } from "../../repos/customerLicenseRepo.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { licenseGateRepo } from "../../repos/licenseGateRepo.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { resolveLicenseDefinitionsForParents } from "./resolveLicenseDefinitions.js";
import type { CustomerLicenseState } from "./types.js";

const loadCustomerLicenseState = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<CustomerLicenseState> => {
	const parents = fullCustomer.customer_products.filter((customerProduct) =>
		isLicenseParentCustomerProduct({ customerProduct }),
	);
	const [definitionsByParentId, assignments, balances] = await Promise.all([
		resolveLicenseDefinitionsForParents({ ctx, parents }),
		licenseAssignmentRepo.listAssignmentsWithEntityAndProductByCustomer({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
		}),
		customerLicenseRepo.listByParentCustomerProductIds({
			db: ctx.db,
			parentCustomerProductIds: fullCustomer.customer_products.map(
				(customerProduct) => customerProduct.id,
			),
		}),
	]);
	const licenseProductCache = new Map<string, Promise<FullProduct>>();
	const getLicenseProduct = (licenseInternalProductId: string) => {
		const cached = licenseProductCache.get(licenseInternalProductId);
		if (cached) return cached;
		const product = getFullLicenseProduct({
			ctx,
			idOrInternalId: licenseInternalProductId,
		});
		licenseProductCache.set(licenseInternalProductId, product);
		return product;
	};
	return {
		parents,
		definitionsByParentId,
		assignments,
		balances,
		getLicenseProduct,
	};
};

/** Ends or re-parents active assignments whose parent is no longer valid,
 * patching state.assignments to mirror the writes. */
const transitionStrandedAssignments = async ({
	ctx,
	fullCustomer,
	state,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	state: CustomerLicenseState;
}) => {
	const { parents, definitionsByParentId } = state;
	const validParentIds = new Set(parents.map((parent) => parent.id));
	const strandedAssignments = state.assignments.filter(
		({ assignment }) =>
			!(
				assignment.license_parent_customer_product_id &&
				validParentIds.has(assignment.license_parent_customer_product_id)
			),
	);
	if (strandedAssignments.length === 0) return;

	const successorParentByLicenseId = new Map<string, FullCusProduct>();
	for (const parent of parents) {
		for (const definition of definitionsByParentId.get(parent.id) ?? []) {
			if (definition.included <= 0) continue;
			if (
				!successorParentByLicenseId.has(definition.license_internal_product_id)
			) {
				successorParentByLicenseId.set(
					definition.license_internal_product_id,
					parent,
				);
			}
		}
	}

	const endedAt = Date.now();
	const reparentedAssignmentIdsByParentId = new Map<string, string[]>();
	const endedAssignmentIds = new Set<string>();
	for (const { assignment } of strandedAssignments) {
		const successor = successorParentByLicenseId.get(
			assignment.internal_product_id,
		);
		if (successor) {
			const assignmentIds =
				reparentedAssignmentIdsByParentId.get(successor.id) ?? [];
			assignmentIds.push(assignment.id);
			reparentedAssignmentIdsByParentId.set(successor.id, assignmentIds);
			assignment.license_parent_customer_product_id = successor.id;
			continue;
		}
		endedAssignmentIds.add(assignment.id);
	}

	if (endedAssignmentIds.size > 0) {
		await licenseAssignmentRepo.expireAssignmentsByIds({
			db: ctx.db,
			assignmentIds: [...endedAssignmentIds],
			endedAt,
		});
		state.assignments = state.assignments.filter(
			({ assignment }) => !endedAssignmentIds.has(assignment.id),
		);
	}
	for (const [
		parentCustomerProductId,
		assignmentIds,
	] of reparentedAssignmentIdsByParentId) {
		await licenseAssignmentRepo.reparentAssignmentsByIds({
			db: ctx.db,
			assignmentIds,
			parentCustomerProductId,
		});
	}
};

/** Converge customer_licenses rows: granted from resolved definitions,
 * remaining self-healed to granted - live assignments, rows for dead parents
 * gone. Rebuilds state.balances from the written rows. */
const reconcileAssignmentBalances = async ({
	ctx,
	fullCustomer,
	state,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	state: CustomerLicenseState;
}) => {
	const { parents, definitionsByParentId } = state;

	const assignedByKey = new Map<string, number>();
	for (const { assignment } of state.assignments) {
		const key = `${assignment.license_parent_customer_product_id}:${assignment.internal_product_id}`;
		assignedByKey.set(key, (assignedByKey.get(key) ?? 0) + 1);
	}

	const convergedBalances: CustomerLicenseState["balances"] = [];
	for (const parent of parents) {
		for (const definition of definitionsByParentId.get(parent.id) ?? []) {
			if (definition.included <= 0) continue;
			const balance = await customerLicenseRepo.upsertGranted({
				db: ctx.db,
				internalCustomerId: fullCustomer.internal_id,
				parentCustomerProductId: parent.id,
				licenseInternalProductId: definition.license_internal_product_id,
				granted: definition.included,
			});
			const assigned =
				assignedByKey.get(
					`${parent.id}:${definition.license_internal_product_id}`,
				) ?? 0;
			const remaining = definition.included - assigned;
			if (balance.remaining !== remaining) {
				await customerLicenseRepo.setRemaining({
					db: ctx.db,
					customerLicenseId: balance.id,
					remaining,
				});
			}
			convergedBalances.push({ ...balance, remaining });
		}
	}
	state.balances = convergedBalances;

	await customerLicenseRepo.deleteByParentIdsExcept({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		keepParentCustomerProductIds: parents.map((parent) => parent.id),
	});
};

/**
 * Whole-customer license convergence: loads the customer's license state,
 * transitions stranded assignments, converges balances. Idempotent; the
 * returned state mirrors the database after the writes, or null when the
 * customer touches no licenses.
 *
 * Pass internalCustomerId (or a FRESH fullCustomer) so no-license customers
 * are gated out before the full-customer read.
 */
export const reconcileLicenseStateForCustomer = async ({
	ctx,
	customerId,
	internalCustomerId,
	fullCustomer,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId?: string;
	fullCustomer?: FullCustomer;
}): Promise<CustomerLicenseState | null> => {
	const gateInternalId = fullCustomer?.internal_id ?? internalCustomerId;
	if (
		gateInternalId &&
		!(await licenseGateRepo.touchesLicenses({
			db: ctx.db,
			internalCustomerId: gateInternalId,
		}))
	) {
		return null;
	}

	const customer =
		fullCustomer ??
		(await CusService.getFull({ ctx, idOrInternalId: customerId }));
	if (
		!gateInternalId &&
		!(await licenseGateRepo.touchesLicenses({
			db: ctx.db,
			internalCustomerId: customer.internal_id,
		}))
	) {
		return null;
	}

	const state = await loadCustomerLicenseState({ ctx, fullCustomer: customer });

	await transitionStrandedAssignments({ ctx, fullCustomer: customer, state });
	await reconcileAssignmentBalances({ ctx, fullCustomer: customer, state });

	logLicenseAction({
		ctx,
		action: "reconcile",
		details: {
			customer: customerId,
			parents: state.parents.length,
			definitions: [...state.definitionsByParentId.values()].flat().length,
		},
	});
	return state;
};
