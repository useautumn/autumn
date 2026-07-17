import {
	type CustomerLicenseTransition,
	customerProductHasActiveStatus,
	type FullCusProduct,
	InternalError,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { extractPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/extractPooledBalanceOps.js";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { initFullCustomerProductFromCustomerLicense } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";
import { enqueueRepointSeatEntitlements } from "@/trigger/licenses/repointSeatEntitlementsTask";

type RestoreCustomerEntitlement = {
	id: string;
	target: FullCusProduct["customer_entitlements"][number];
};

export type PreparedCustomerLicenseTransition = {
	transition: CustomerLicenseTransition;
	fullCustomerId: string;
	operations: PooledBalanceOp[];
	restoredCustomerEntitlements: RestoreCustomerEntitlement[];
};

const executeTransitionRows = async ({
	ctx,
	transition,
	repointEntitlements,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	repointEntitlements: boolean;
}) => {
	const { incomingCustomerLicense, updates } = transition;
	const planLicense = incomingCustomerLicense.planLicense;
	if (!planLicense) return;

	if (isSameRowTransition(transition)) {
		await customerLicenseRepo.repointDefinition({
			db: ctx.db,
			customerLicenseId: incomingCustomerLicense.id,
			planLicenseId: planLicense.id,
			included: planLicense.included,
			paidQuantity: updates.paidQuantity,
		});
		ctx.logger.info(
			`[licenseTransitions] repointed pool ${incomingCustomerLicense.id} definition ${transition.outgoingCustomerLicense.plan_license_id} -> ${planLicense.id}`,
			{
				data: {
					customerLicenseId: incomingCustomerLicense.id,
					customerLicenseLinkId: updates.linkId,
					fromPlanLicenseId: transition.outgoingCustomerLicense.plan_license_id,
					toPlanLicenseId: planLicense.id,
					updates,
				},
			},
		);
	}

	for (const priceTransition of transition.priceTransitions) {
		const repointedRows = await licenseAssignmentRepo.repointSeatPrices({
			db: ctx.db,
			customerLicenseLinkId: updates.linkId,
			fromPriceId: priceTransition.fromPriceId,
			toPriceId: priceTransition.toPriceId,
		});
		ctx.logger.info(
			`[licenseTransitions] repointed seat prices link=${updates.linkId} from=${priceTransition.fromPriceId} to=${priceTransition.toPriceId} rows=${repointedRows}`,
			{
				data: {
					customerLicenseLinkId: updates.linkId,
					...priceTransition,
					repointedRows,
				},
			},
		);
	}

	if (repointEntitlements && transition.entitlementTransitions.length > 0) {
		const repointedRows = await licenseAssignmentRepo.repointSeatEntitlements({
			db: ctx.db,
			customerLicenseLinkId: updates.linkId,
			entitlementTransitions: transition.entitlementTransitions,
		});
		ctx.logger.info(
			`[licenseTransitions] repointed seat entitlements link=${updates.linkId} rows=${repointedRows}`,
		);
	}
};

const buildPooledTransitionOperations = async ({
	ctx,
	transition,
	pendingCustomerProducts = [],
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
	pendingCustomerProducts?: FullCusProduct[];
}): Promise<Omit<PreparedCustomerLicenseTransition, "transition">> => {
	const { incomingCustomerLicense, updates } = transition;
	const planLicense = incomingCustomerLicense.planLicense;
	if (!planLicense) {
		return {
			fullCustomerId: incomingCustomerLicense.internal_customer_id,
			operations: [],
			restoredCustomerEntitlements: [],
		};
	}

	const [fullCustomer, customerProducts] = await Promise.all([
		CusService.getFull({
			ctx,
			idOrInternalId: incomingCustomerLicense.internal_customer_id,
			withEntities: true,
		}),
		CusProductService.list({
			db: ctx.db,
			internalCustomerId: incomingCustomerLicense.internal_customer_id,
		}),
	]);
	const assignments = customerProducts.filter(
		(customerProduct) =>
			customerProduct.customer_license_link_id === updates.linkId &&
			customerProduct.internal_entity_id !== null &&
			customerProductHasActiveStatus(customerProduct),
	);
	if (assignments.length === 0) {
		return {
			fullCustomerId: fullCustomer.id ?? fullCustomer.internal_id,
			operations: [],
			restoredCustomerEntitlements: [],
		};
	}

	const parentCustomerProduct = [
		...customerProducts,
		...pendingCustomerProducts,
	].find(
		(customerProduct) =>
			customerProduct.id === incomingCustomerLicense.parent_customer_product_id,
	);
	if (!parentCustomerProduct) {
		throw new InternalError({
			message: `License transition parent '${incomingCustomerLicense.parent_customer_product_id}' was not found.`,
		});
	}

	const contributions =
		await pooledBalanceRepo.listContributionsBySourceCustomerProductIds({
			db: ctx.db,
			sourceCustomerProductIds: assignments.map(
				(customerProduct) => customerProduct.id,
			),
		});
	const pools = await pooledBalanceRepo.listByIds({
		db: ctx.db,
		pooledBalanceIds: [
			...new Set(
				contributions.map((contribution) => contribution.pooled_balance_id),
			),
		],
	});
	const poolById = new Map(pools.map((pool) => [pool.id, pool]));
	const successorEntitlementIdByPreviousId = new Map(
		transition.entitlementTransitions.map((entitlementTransition) => [
			entitlementTransition.fromEntitlementId,
			entitlementTransition.toEntitlementId,
		]),
	);
	const operations: PooledBalanceOp[] = [];
	const restoredCustomerEntitlements: RestoreCustomerEntitlement[] = [];
	const now = Date.now();
	const resetCycleAnchor =
		parentCustomerProduct.billing_cycle_anchor ??
		parentCustomerProduct.created_at ??
		now;

	for (const assignment of assignments) {
		const targetCustomerProduct = {
			...initFullCustomerProductFromCustomerLicense({
				ctx,
				fullCustomer,
				customerLicense: { ...incomingCustomerLicense, planLicense },
				internalEntityId: assignment.internal_entity_id as string,
				resetCycleAnchor,
				currentEpochMs: now,
			}),
			id: assignment.id,
		};
		const targetOperations = extractPooledBalanceOps({
			customerProduct: targetCustomerProduct,
			resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
			resetOwnerId: parentCustomerProduct.id,
		}).pooledBalanceOps.filter((operation) => operation.op === "upsert_source");
		const sourceContributions = contributions.filter(
			(contribution) =>
				contribution.source_customer_product_id === assignment.id,
		);
		const unmatchedContributionIds = new Set(
			sourceContributions.map((contribution) => contribution.id),
		);

		for (const targetOperation of targetOperations) {
			let matchingContributions = sourceContributions.filter(
				(contribution) =>
					unmatchedContributionIds.has(contribution.id) &&
					(successorEntitlementIdByPreviousId.get(
						contribution.source_entitlement_id,
					) ?? contribution.source_entitlement_id) ===
						targetOperation.sourceEntitlementId,
			);
			if (matchingContributions.length === 0) {
				matchingContributions = sourceContributions.filter((contribution) => {
					const pool = poolById.get(contribution.pooled_balance_id);
					return (
						unmatchedContributionIds.has(contribution.id) &&
						pool?.internal_feature_id === targetOperation.internalFeatureId
					);
				});
			}
			if (matchingContributions.length > 1) {
				throw new InternalError({
					message: `Pooled sources for license assignment '${assignment.id}' cannot be matched unambiguously.`,
				});
			}

			const contribution = matchingContributions[0];
			if (!contribution) {
				operations.push(targetOperation);
				continue;
			}
			unmatchedContributionIds.delete(contribution.id);
			operations.push({
				...targetOperation,
				op: "transfer_source",
				contributionId: contribution.id,
				expectedPooledBalanceId: contribution.pooled_balance_id,
			});
		}

		for (const contribution of sourceContributions) {
			if (!unmatchedContributionIds.has(contribution.id)) continue;
			operations.push({
				op: "remove_contribution",
				internalCustomerId: assignment.internal_customer_id,
				sourceCustomerProductId: assignment.id,
				sourceEntitlementId: contribution.source_entitlement_id,
				effectiveAt: null,
			});
		}

		for (const customerEntitlement of assignment.customer_entitlements) {
			const targetEntitlementId =
				successorEntitlementIdByPreviousId.get(
					customerEntitlement.entitlement.id,
				) ?? customerEntitlement.entitlement.id;
			const targetCustomerEntitlement =
				targetCustomerProduct.customer_entitlements.find(
					(candidate) => candidate.entitlement.id === targetEntitlementId,
				);
			if (!targetCustomerEntitlement?.entitlement.pooled) {
				const wasPooled = sourceContributions.some(
					(contribution) =>
						contribution.source_entitlement_id ===
						customerEntitlement.entitlement.id,
				);
				if (wasPooled && targetCustomerEntitlement) {
					restoredCustomerEntitlements.push({
						id: customerEntitlement.id,
						target: targetCustomerEntitlement,
					});
				}
			}
		}
	}

	return {
		fullCustomerId: fullCustomer.id ?? fullCustomer.internal_id,
		operations,
		restoredCustomerEntitlements,
	};
};

export const prepareCustomerLicenseTransitions = async ({
	ctx,
	customerLicenseTransitions,
	pendingCustomerProducts = [],
}: {
	ctx: AutumnContext;
	customerLicenseTransitions: CustomerLicenseTransition[] | undefined;
	pendingCustomerProducts?: FullCusProduct[];
}): Promise<PreparedCustomerLicenseTransition[]> =>
	Promise.all(
		(customerLicenseTransitions ?? []).flatMap((transition) =>
			transition.incomingCustomerLicense.planLicense
				? [
						buildPooledTransitionOperations({
							ctx,
							transition,
							pendingCustomerProducts,
						}).then((pooledTransition) => ({
							transition,
							...pooledTransition,
						})),
					]
				: [],
		),
	);

export const executePreparedCustomerLicenseTransitionRows = async ({
	ctx,
	preparedTransitions,
}: {
	ctx: AutumnContext;
	preparedTransitions: PreparedCustomerLicenseTransition[];
}) => {
	for (const preparedTransition of preparedTransitions) {
		await executeTransitionRows({
			ctx,
			transition: preparedTransition.transition,
			repointEntitlements: preparedTransition.operations.length > 0,
		});
	}
};

export const restorePreparedCustomerLicenseEntitlements = async ({
	ctx,
	preparedTransitions,
}: {
	ctx: AutumnContext;
	preparedTransitions: PreparedCustomerLicenseTransition[];
}) => {
	for (const { restoredCustomerEntitlements } of preparedTransitions) {
		for (const restoration of restoredCustomerEntitlements) {
			await CusEntService.update({
				ctx,
				id: restoration.id,
				updates: {
					balance: restoration.target.balance ?? 0,
					adjustment: restoration.target.adjustment,
					additional_balance: restoration.target.additional_balance,
					entities: restoration.target.entities,
					reset_cycle_anchor: restoration.target.reset_cycle_anchor,
					next_reset_at: restoration.target.next_reset_at,
				},
				incrementCacheVersion: true,
			});
		}
	}
};

export const enqueuePreparedCustomerLicenseEntitlementTransitions = async ({
	ctx,
	preparedTransitions,
}: {
	ctx: AutumnContext;
	preparedTransitions: PreparedCustomerLicenseTransition[];
}) => {
	for (const { transition, operations } of preparedTransitions) {
		if (
			operations.length > 0 ||
			transition.entitlementTransitions.length === 0
		) {
			continue;
		}
		await enqueueRepointSeatEntitlements({
			ctx,
			customerLicenseLinkId: transition.updates.linkId,
			entitlementTransitions: transition.entitlementTransitions,
			source: "license-transition",
		});
	}
};

/**
 * Executes license transitions from the plan.
 * Pool half: same-row transitions converge the surviving row in place;
 * cross-row successors already persisted through their insert.
 * Seat half: prices repoint inline (they must land with the Stripe update);
 * entitlement repoints are heavy on the fat cusEnts table and don't bill,
 * so they converge in the background. Every mapping is logged so a bad
 * transition is reversible by swapping from/to.
 */
export const executeCustomerLicenseTransitions = async ({
	ctx,
	customerLicenseTransitions,
	preparedTransitions: providedPreparedTransitions,
}: {
	ctx: AutumnContext;
	customerLicenseTransitions: CustomerLicenseTransition[] | undefined;
	preparedTransitions?: PreparedCustomerLicenseTransition[];
}) => {
	const preparedTransitions =
		providedPreparedTransitions ??
		(await prepareCustomerLicenseTransitions({
			ctx,
			customerLicenseTransitions,
		}));
	for (const preparedTransition of preparedTransitions) {
		if (preparedTransition.operations.length > 0) {
			await executePooledBalanceOps({
				ctx,
				customerId: preparedTransition.fullCustomerId,
				pooledBalanceOps: preparedTransition.operations,
				beforeDatabaseOperations: ({ db }) =>
					executePreparedCustomerLicenseTransitionRows({
						ctx: { ...ctx, db },
						preparedTransitions: [preparedTransition],
					}),
				beforeRebalance: ({ db }) =>
					restorePreparedCustomerLicenseEntitlements({
						ctx: { ...ctx, db },
						preparedTransitions: [preparedTransition],
					}),
			});
			continue;
		}

		await executePreparedCustomerLicenseTransitionRows({
			ctx,
			preparedTransitions: [preparedTransition],
		});
	}
	await enqueuePreparedCustomerLicenseEntitlementTransitions({
		ctx,
		preparedTransitions,
	});

	return preparedTransitions.some(({ operations }) => operations.length > 0);
};
