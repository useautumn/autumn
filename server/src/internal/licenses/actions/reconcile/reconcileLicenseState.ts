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
import { offeredPools, poolKey } from "./stateHelpers.js";
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
/** First live parent offering each license — the reparent target for a
 * stranded assignment of that license. */
const buildSuccessorParentByLicense = (state: CustomerLicenseState) => {
	const byLicense = new Map<string, FullCusProduct>();
	for (const { parent, definition } of offeredPools(state)) {
		if (!byLicense.has(definition.license_internal_product_id)) {
			byLicense.set(definition.license_internal_product_id, parent);
		}
	}
	return byLicense;
};

/** Splits stranded assignments into reparent groups (successor found) and
 * ended ids (none); patches each reparented assignment's parent in place. */
const partitionStrandedAssignments = ({
	stranded,
	successorParentByLicense,
}: {
	stranded: CustomerLicenseState["assignments"];
	successorParentByLicense: Map<string, FullCusProduct>;
}) => {
	const reparentedByParentId = new Map<string, string[]>();
	const endedIds = new Set<string>();
	for (const { assignment } of stranded) {
		const successor = successorParentByLicense.get(
			assignment.internal_product_id,
		);
		if (!successor) {
			endedIds.add(assignment.id);
			continue;
		}
		reparentedByParentId.set(successor.id, [
			...(reparentedByParentId.get(successor.id) ?? []),
			assignment.id,
		]);
		assignment.license_parent_customer_product_id = successor.id;
	}
	return { reparentedByParentId, endedIds };
};

const transitionStrandedAssignments = async ({
	ctx,
	state,
}: {
	ctx: AutumnContext;
	state: CustomerLicenseState;
}) => {
	const validParentIds = new Set(state.parents.map((parent) => parent.id));
	const stranded = state.assignments.filter(
		({ assignment }) =>
			!(
				assignment.license_parent_customer_product_id &&
				validParentIds.has(assignment.license_parent_customer_product_id)
			),
	);
	if (stranded.length === 0) return;

	const { reparentedByParentId, endedIds } = partitionStrandedAssignments({
		stranded,
		successorParentByLicense: buildSuccessorParentByLicense(state),
	});

	if (endedIds.size > 0) {
		await licenseAssignmentRepo.expireAssignmentsByIds({
			db: ctx.db,
			assignmentIds: [...endedIds],
			endedAt: Date.now(),
		});
		state.assignments = state.assignments.filter(
			({ assignment }) => !endedIds.has(assignment.id),
		);
	}
	await Promise.all(
		[...reparentedByParentId].map(([parentCustomerProductId, assignmentIds]) =>
			licenseAssignmentRepo.reparentAssignmentsByIds({
				db: ctx.db,
				assignmentIds,
				parentCustomerProductId,
			}),
		),
	);
};

/** Converge customer_licenses rows: granted from resolved definitions,
 * remaining self-healed to granted - live assignments, rows for dead parents
 * gone. Rebuilds state.balances from the written rows. */
const countActiveByPool = (
	assignments: CustomerLicenseState["assignments"],
) => {
	const byPool = new Map<string, number>();
	for (const { assignment } of assignments) {
		const key = poolKey(
			assignment.license_parent_customer_product_id,
			assignment.internal_product_id,
		);
		byPool.set(key, (byPool.get(key) ?? 0) + 1);
	}
	return byPool;
};

const reconcileAssignmentBalances = async ({
	ctx,
	fullCustomer,
	state,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	state: CustomerLicenseState;
}) => {
	const assignedByPool = countActiveByPool(state.assignments);

	// Each pool's upsert -> setRemaining is independent of the others.
	state.balances = await Promise.all(
		[...offeredPools(state)].map(async ({ parent, definition }) => {
			const balance = await customerLicenseRepo.upsertGranted({
				db: ctx.db,
				internalCustomerId: fullCustomer.internal_id,
				parentCustomerProductId: parent.id,
				licenseInternalProductId: definition.license_internal_product_id,
				granted: definition.included,
			});
			const remaining =
				definition.included -
				(assignedByPool.get(
					poolKey(parent.id, definition.license_internal_product_id),
				) ?? 0);
			if (balance.remaining !== remaining) {
				await customerLicenseRepo.setRemaining({
					db: ctx.db,
					customerLicenseId: balance.id,
					remaining,
				});
			}
			return { ...balance, remaining };
		}),
	);

	await customerLicenseRepo.deleteByParentIdsExcept({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		keepParentCustomerProductIds: state.parents.map((parent) => parent.id),
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

	await transitionStrandedAssignments({ ctx, state });
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
