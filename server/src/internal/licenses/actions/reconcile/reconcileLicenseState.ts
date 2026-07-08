import type { FullCusProduct, FullCustomer, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { LicenseTopology } from "../../licenseTypes.js";
import {
	getFullLicenseProduct,
	isLicenseParentCustomerProduct,
} from "../../licenseUtils.js";
import { customerLicenseRepo } from "../../repos/customerLicenseRepo.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { licenseGateRepo } from "../../repos/licenseGateRepo.js";
import { endProvisionedCustomerProducts } from "../assignments/utils/endProvisionedCustomerProducts.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { syncLicenseCarriersForCustomer } from "./licenseCarrier.js";
import { resolveLicenseDefinitionsForParents } from "./resolveLicenseDefinitions.js";

const loadLicenseTopology = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<LicenseTopology> => {
	const validParents = fullCustomer.customer_products.filter(
		(customerProduct) => isLicenseParentCustomerProduct({ customerProduct }),
	);
	const definitionsByParentId = await resolveLicenseDefinitionsForParents({
		ctx,
		parents: validParents,
	});
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
	return { validParents, definitionsByParentId, getLicenseProduct };
};

const transitionStrandedAssignments = async ({
	ctx,
	fullCustomer,
	topology,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	topology: LicenseTopology;
}) => {
	const { validParents, definitionsByParentId } = topology;
	const strandedAssignments =
		await licenseAssignmentRepo.listActiveStrandedByCustomer({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			validParentCustomerProductIds: validParents.map((parent) => parent.id),
		});
	if (strandedAssignments.length === 0) return;

	const successorParentByLicenseId = new Map<string, FullCusProduct>();
	for (const parent of validParents) {
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
	const endedAssignmentIds: string[] = [];
	for (const assignment of strandedAssignments) {
		const successor = successorParentByLicenseId.get(
			assignment.internal_product_id,
		);
		if (successor) {
			const assignmentIds =
				reparentedAssignmentIdsByParentId.get(successor.id) ?? [];
			assignmentIds.push(assignment.id);
			reparentedAssignmentIdsByParentId.set(successor.id, assignmentIds);
			continue;
		}
		endedAssignmentIds.push(assignment.id);
	}

	if (endedAssignmentIds.length > 0) {
		await endProvisionedCustomerProducts({
			ctx,
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			assignmentIds: endedAssignmentIds,
			endedAt,
		});
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
 * remaining self-healed to granted - live assignments, rows for dead parents gone. */
const reconcileAssignmentBalances = async ({
	ctx,
	fullCustomer,
	topology,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	topology: LicenseTopology;
}) => {
	const { validParents, definitionsByParentId } = topology;

	for (const parent of validParents) {
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
				await licenseAssignmentRepo.countActiveByParentAndLicense({
					db: ctx.db,
					parentCustomerProductId: parent.id,
					licenseInternalProductId: definition.license_internal_product_id,
				});
			const remaining = definition.included - assigned;
			if (balance.remaining !== remaining) {
				await customerLicenseRepo.setRemaining({
					db: ctx.db,
					customerLicenseId: balance.id,
					remaining,
				});
			}
		}
	}

	await customerLicenseRepo.deleteByParentIdsExcept({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		keepParentCustomerProductIds: validParents.map((parent) => parent.id),
	});
};

/**
 * Whole-customer license recompute: re-parents or ends stranded assignments,
 * converges assignment balances and billing carriers. Idempotent;
 * call after any parent mutation commits. Returns the topology it converged
 * against, or null when the customer touches no licenses.
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
}): Promise<LicenseTopology | null> => {
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

	const topology = await loadLicenseTopology({ ctx, fullCustomer: customer });

	await transitionStrandedAssignments({
		ctx,
		fullCustomer: customer,
		topology,
	});
	await reconcileAssignmentBalances({
		ctx,
		fullCustomer: customer,
		topology,
	});
	await syncLicenseCarriersForCustomer({
		ctx,
		fullCustomer: customer,
		topology,
	});
	logLicenseAction({
		ctx,
		action: "reconcile",
		details: {
			customer: customerId,
			parents: topology.validParents.length,
			definitions: [...topology.definitionsByParentId.values()].flat().length,
		},
	});
	return topology;
};
