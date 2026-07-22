import {
	type CustomerLicenseTransition,
	customerProductHasActiveStatus,
	entsAreSame,
	type FullCusProduct,
	type InsertCustomerEntitlement,
	InternalError,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import { batchTransitionTask } from "@/internal/billing/v2/actions/batchTransition/tasks/batchTransitionTask.js";
import { isSameRowTransition } from "@/internal/billing/v2/compute/customerLicenseTransitions/isSameRowTransition.js";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { extractPooledBalanceOps } from "@/internal/billing/v2/pooledBalances/compute/extractPooledBalanceOps.js";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { initFullCustomerProductFromCustomerLicense } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";
import { generateId } from "@/utils/genUtils.js";

type TransitionCustomerEntitlement =
	FullCusProduct["customer_entitlements"][number];

type RestoreCustomerEntitlement = {
	id: string;
	target: InsertCustomerEntitlement;
};

export type PreparedPooledTargetCustomerEntitlementMutation =
	| {
			type: "insert";
			target: InsertCustomerEntitlement;
	  }
	| {
			type: "update";
			id: string;
			target: InsertCustomerEntitlement;
	  };

export type PreparedCustomerLicenseTransition = {
	transition: CustomerLicenseTransition;
	fullCustomerId: string;
	operations: PooledBalanceOp[];
	pooledTargetCustomerEntitlementMutations: PreparedPooledTargetCustomerEntitlementMutation[];
	restoredCustomerEntitlements: RestoreCustomerEntitlement[];
};

const customerEntitlementToTarget = ({
	customerEntitlement,
	customerProductId,
	id = customerEntitlement.id,
}: {
	customerEntitlement: TransitionCustomerEntitlement;
	customerProductId: string;
	id?: string;
}): InsertCustomerEntitlement => ({
	id,
	customer_product_id: customerProductId,
	entitlement_id: customerEntitlement.entitlement.id,
	internal_customer_id: customerEntitlement.internal_customer_id,
	internal_entity_id: customerEntitlement.internal_entity_id,
	internal_feature_id: customerEntitlement.entitlement.internal_feature_id,
	feature_id: customerEntitlement.entitlement.feature.id,
	customer_id: customerEntitlement.customer_id,
	created_at: customerEntitlement.created_at,
	unlimited: customerEntitlement.unlimited,
	balance: customerEntitlement.balance ?? 0,
	additional_balance: customerEntitlement.additional_balance,
	adjustment: customerEntitlement.adjustment,
	entities: customerEntitlement.entities,
	usage_allowed: customerEntitlement.usage_allowed,
	separate_interval: customerEntitlement.separate_interval,
	reset_cycle_anchor: customerEntitlement.reset_cycle_anchor,
	next_reset_at: customerEntitlement.next_reset_at,
	expires_at: customerEntitlement.expires_at,
	cache_version: customerEntitlement.cache_version,
	external_id: customerEntitlement.external_id,
});

const targetToUpdates = (target: InsertCustomerEntitlement) => {
	const {
		id: _id,
		customer_product_id: _customerProductId,
		created_at: _createdAt,
		cache_version: _cacheVersion,
		...updates
	} = target;
	return updates;
};

const findSourceCustomerEntitlement = ({
	assignment,
	targetCustomerEntitlement,
	successorEntitlementIdByPreviousId,
}: {
	assignment: FullCusProduct;
	targetCustomerEntitlement: TransitionCustomerEntitlement;
	successorEntitlementIdByPreviousId: Map<string, string>;
}) => {
	const targetEntitlementId = targetCustomerEntitlement.entitlement.id;
	const mappedCandidates = assignment.customer_entitlements.filter(
		(customerEntitlement) =>
			customerEntitlement.entitlement.id === targetEntitlementId ||
			successorEntitlementIdByPreviousId.get(
				customerEntitlement.entitlement.id,
			) === targetEntitlementId,
	);
	if (mappedCandidates.length > 1) {
		throw new InternalError({
			message: `Customer entitlements for license assignment '${assignment.id}' cannot be matched unambiguously to '${targetEntitlementId}'.`,
		});
	}
	if (mappedCandidates.length === 1) return mappedCandidates[0];

	const matchingDefinitionCandidates = assignment.customer_entitlements.filter(
		(customerEntitlement) =>
			entsAreSame(
				customerEntitlement.entitlement,
				targetCustomerEntitlement.entitlement,
			),
	);
	if (matchingDefinitionCandidates.length > 1) {
		throw new InternalError({
			message: `Customer entitlements for license assignment '${assignment.id}' cannot be matched unambiguously to the target definition '${targetEntitlementId}'.`,
		});
	}
	return matchingDefinitionCandidates[0];
};

const executeTransitionRow = async ({
	ctx,
	transition,
}: {
	ctx: AutumnContext;
	transition: CustomerLicenseTransition;
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
		return;
	}

	await customerLicenseRepo.carryCustomerLicenseState({
		db: ctx.db,
		customerLicenseId: incomingCustomerLicense.id,
		linkId: updates.linkId,
		granted: updates.granted,
		remaining: updates.remaining,
		paidQuantity: updates.paidQuantity,
	});
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
	const { incomingCustomerLicense, outgoingCustomerLicense, updates } =
		transition;
	const planLicense = incomingCustomerLicense.planLicense;
	if (!planLicense) {
		return {
			fullCustomerId: incomingCustomerLicense.internal_customer_id,
			operations: [],
			pooledTargetCustomerEntitlementMutations: [],
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
			pooledTargetCustomerEntitlementMutations: [],
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
	const outgoingProduct = outgoingCustomerLicense.planLicense?.product;
	const entitlementTransitions = outgoingProduct
		? computeProductTransitions({
				fromProduct: outgoingProduct,
				toProduct: planLicense.product,
			}).entitlementPrices.transitions
		: [];
	const successorEntitlementIdByPreviousId = new Map(
		entitlementTransitions.map(
			({ fromEntitlementPrice, toEntitlementPrice }) => [
				fromEntitlementPrice.entitlement.id,
				toEntitlementPrice.entitlement.id,
			],
		),
	);
	const operations: PooledBalanceOp[] = [];
	const pooledTargetCustomerEntitlementMutations: PreparedPooledTargetCustomerEntitlementMutation[] =
		[];
	const restoredCustomerEntitlements: RestoreCustomerEntitlement[] = [];
	const now = Date.now();
	const resetCycleAnchor =
		parentCustomerProduct.billing_cycle_anchor ??
		parentCustomerProduct.created_at ??
		now;

	for (const assignment of assignments) {
		const initializedTargetCustomerProduct = {
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
		const {
			customerProduct: targetCustomerProduct,
			pooledBalanceOps: extractedTargetOperations,
		} = extractPooledBalanceOps({
			customerProduct: initializedTargetCustomerProduct,
			resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
			resetOwnerId: parentCustomerProduct.id,
		});
		const targetOperations = extractedTargetOperations.filter(
			(operation) => operation.op === "upsert_source",
		);
		const sourceContributions = contributions.filter(
			(contribution) =>
				contribution.source_customer_product_id === assignment.id,
		);
		const unmatchedContributionIds = new Set(
			sourceContributions.map((contribution) => contribution.id),
		);

		for (const targetOperation of targetOperations) {
			const targetCustomerEntitlement =
				targetCustomerProduct.customer_entitlements.find(
					(candidate) =>
						candidate.entitlement.id === targetOperation.sourceEntitlementId,
				);
			if (!targetCustomerEntitlement) {
				throw new InternalError({
					message: `Pooled target entitlement '${targetOperation.sourceEntitlementId}' was not found for license assignment '${assignment.id}'.`,
				});
			}
			const sourceCustomerEntitlement = findSourceCustomerEntitlement({
				assignment,
				targetCustomerEntitlement,
				successorEntitlementIdByPreviousId,
			});
			const target = customerEntitlementToTarget({
				customerEntitlement: targetCustomerEntitlement,
				customerProductId: assignment.id,
				id: sourceCustomerEntitlement?.id,
			});
			if (!sourceCustomerEntitlement) {
				pooledTargetCustomerEntitlementMutations.push({
					type: "insert",
					target,
				});
			} else if (
				sourceCustomerEntitlement.entitlement.id !==
				targetCustomerEntitlement.entitlement.id
			) {
				pooledTargetCustomerEntitlementMutations.push({
					type: "update",
					id: sourceCustomerEntitlement.id,
					target,
				});
			}

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
						target: customerEntitlementToTarget({
							customerEntitlement: targetCustomerEntitlement,
							customerProductId: assignment.id,
							id: customerEntitlement.id,
						}),
					});
				}
			}
		}
	}

	return {
		fullCustomerId: fullCustomer.id ?? fullCustomer.internal_id,
		operations,
		pooledTargetCustomerEntitlementMutations,
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
		await executeTransitionRow({
			ctx,
			transition: preparedTransition.transition,
		});
		for (const mutation of preparedTransition.pooledTargetCustomerEntitlementMutations) {
			if (mutation.type === "insert") {
				await CusEntService.insert({ ctx, data: [mutation.target] });
				continue;
			}
			await CusEntService.update({
				ctx,
				id: mutation.id,
				updates: targetToUpdates(mutation.target),
				incrementCacheVersion: true,
			});
		}
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
				updates: targetToUpdates(restoration.target),
				incrementCacheVersion: true,
			});
		}
	}
};

export const triggerPreparedCustomerLicenseBatchTransitions = async ({
	ctx,
	preparedTransitions,
}: {
	ctx: AutumnContext;
	preparedTransitions: PreparedCustomerLicenseTransition[];
}) => {
	for (const { transition } of preparedTransitions) {
		await batchTransitionTask.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: ctx.customerId,
				transition,
				executionScope: {
					batchTransitionId: generateId("batch_transition"),
					assignmentCutoffMs: Date.now(),
				},
			},
			{ concurrencyKey: transition.updates.linkId },
		);
	}
};

/** Converges license pools synchronously, then dispatches assigned-seat transitions. */
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
	await triggerPreparedCustomerLicenseBatchTransitions({
		ctx,
		preparedTransitions,
	});

	return preparedTransitions.some(({ operations }) => operations.length > 0);
};
