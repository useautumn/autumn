import type {
	Event,
	PgDeductionUpdate,
	SortCusEntParams,
} from "@autumn/shared";
import {
	CusProductStatus,
	cusEntToCusPrice,
	cusProductsToCusEnts,
	cusProductsToCusPrices,
	FeatureUsageType,
	type FullCustomer,
	getMaxOverage,
	getRelevantFeatures,
	InsufficientBalanceError,
	InternalError,
	notNullish,
	nullish,
	orgToInStatuses,
	updateCusEntInFullCus,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "../../../../db/initDrizzle.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { adjustAllowance } from "../../../../trigger/adjustAllowance.js";
import { EventService } from "../../../api/events/EventService.js";
import { CusService } from "../../../customers/CusService.js";
import { CusEntService } from "../../../customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
	getTotalNegativeBalance,
	getUnlimitedAndUsageAllowed,
} from "../../../customers/cusProducts/cusEnts/cusEntUtils.js";
import { deleteCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { getCreditCost } from "../../../features/creditSystemUtils.js";
import { isPaidContinuousUse } from "../../../features/featureUtils.js";
import { constructEvent, type EventInfo } from "./eventUtils.js";
import type { FeatureDeduction } from "./getFeatureDeductions.js";

export type DeductionTxParams = {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	deductions: FeatureDeduction[];
	eventInfo?: EventInfo;
	overageBehaviour?: "cap" | "reject";
	addToAdjustment?: boolean;
	skipAdditionalBalance?: boolean;
	alterGrantedBalance?: boolean;
	fullCus?: FullCustomer; // if provided from function above!
	refreshCache?: boolean; // Whether to refresh Redis cache after deduction (default: true for track, false for sync)

	sortParams?: SortCusEntParams;
};

export const deductFromCusEnts = async ({
	ctx,
	customerId,
	entityId,
	deductions,
	overageBehaviour = "cap",
	addToAdjustment = false,
	skipAdditionalBalance = true,
	alterGrantedBalance = false,
	fullCus,
	sortParams,
}: DeductionTxParams): Promise<{
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	isPaidAllocated: boolean;
	actualDeductions: Record<string, number>;
	remainingAmounts: Record<string, number>;
}> => {
	const { db, org, env } = ctx;

	// Need to getOrCreateCustomer here too...
	if (!fullCus) {
		fullCus = await CusService.getFull({
			db,
			idOrInternalId: customerId,
			orgId: org.id,
			env,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
			entityId,
			withSubs: true,
		});
	}
	const oldFullCus = structuredClone(fullCus);

	const printLogs = false;

	// if (printLogs) {
	// 	console.log(
	// 		`Deductions: 	`,
	// 		deductions.map((d) => ({
	// 			feature_id: d.feature.id,
	// 			deduction: d.deduction,
	// 		})),
	// 	);
	// }

	const isPaidAllocated = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus,
		}),
	);

	if (isPaidAllocated) {
		overageBehaviour = "reject";
		skipAdditionalBalance = true;
	}

	// Track actual deductions per feature
	const actualDeductions: Record<string, number> = {};
	const remainingAmounts: Record<string, number> = {};

	// Need to deduct from customer entitlement...
	for (const deduction of deductions) {
		const { feature, deduction: toDeduct, targetBalance } = deduction;

		const relevantFeatures = getRelevantFeatures({
			features: ctx.features,
			featureId: feature.id,
		});

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureIds: relevantFeatures.map((f) => f.id),
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
			inStatuses: orgToInStatuses({ org }),
			sortParams,
		});

		// if (printLogs) {
		// 	console.log(
		// 		`Cus Ents: `,
		// 		cusEnts.map((ce) => ({
		// 			balance: ce.balance,
		// 			entity_id: ce.customer_product.entity_id,
		// 			cus_ent_id: ce.id,
		// 		})),
		// 	);
		// }

		const { unlimited } = getUnlimitedAndUsageAllowed({
			cusEnts,
			internalFeatureId: feature.internal_id!,
		});

		if (cusEnts.length === 0 || unlimited) continue;

		const cusEntInput = cusEnts.map((ce) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: ce.entitlement.feature,
			});

			const maxOverage = getMaxOverage({ cusEnt: ce });

			const cusPrice = cusEntToCusPrice({ cusEnt: ce });
			const isFreeAllocated =
				ce.entitlement.feature.config?.usage_type ===
					FeatureUsageType.Continuous && nullish(cusPrice);

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				entity_feature_id: ce.entitlement.entity_feature_id,
				usage_allowed: ce.usage_allowed || isFreeAllocated,
				min_balance: notNullish(maxOverage) ? -maxOverage : undefined,
				add_to_adjustment: addToAdjustment,
			};
		});

		// Collect and sort rollovers by expires_at (oldest first)
		const sortedRollovers = cusEnts
			.flatMap((ce) => ce.rollovers || [])
			.sort((a, b) => {
				if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
				if (a.expires_at && !b.expires_at) return -1;
				if (!a.expires_at && b.expires_at) return 1;
				return 0;
			});

		const rolloverIds = sortedRollovers.map((r) => r.id);

		// Extract entitlement IDs for locking
		const cusEntIds = cusEntInput.map((ce) => ce.customer_entitlement_id);

		// Call the stored function to deduct from entitlements with credit costs
		const result = await db.execute(
			sql`SELECT * FROM deduct_from_cus_ents(
				${JSON.stringify({
					sorted_entitlements: cusEntInput,
					amount_to_deduct: toDeduct ?? null,
					target_balance: targetBalance ?? null,
					target_entity_id: entityId || null,
					rollover_ids: rolloverIds.length > 0 ? rolloverIds : null,
					cus_ent_ids: cusEntIds.length > 0 ? cusEntIds : null,
					skip_additional_balance: skipAdditionalBalance,
					alter_granted_balance: alterGrantedBalance,
				})}::jsonb
			)`,
		);

		// Parse the JSONB result
		const resultJson = result[0]?.deduct_from_cus_ents as {
			updates: Record<string, PgDeductionUpdate>;
			remaining: number;
		};

		// log updates
		if (printLogs) {
			console.log(`📊 Postgres updates for ${feature.id}:`, resultJson.updates);
		}

		if (!resultJson) {
			throw new InternalError({
				message: "Failed to deduct from entitlements",
			});
		}

		const { updates, remaining: featureRemaining } = resultJson;

		if (featureRemaining > 0 && overageBehaviour === "reject") {
			throw new InsufficientBalanceError({
				value: toDeduct ?? 1,
				featureId: feature.id,
			});
		}

		// Track the maximum remaining amount across all deductions
		remainingAmounts[feature.id] = featureRemaining;

		// Calculate total deducted from the updates (sum of all deducted amounts)
		const totalDeducted = Object.values(updates).reduce(
			(sum, update) => sum + update.deducted,
			0,
		);

		// Convert updates to actual deduction
		for (const [cusEntId, update] of Object.entries(updates)) {
			const cusEnt = cusEnts.find((ce) => ce.id === cusEntId);
			const deductedFeature = cusEnt?.entitlement.feature;
			if (!deductedFeature) continue;

			const currentDeduction = actualDeductions[deductedFeature.id] || 0;
			actualDeductions[deductedFeature.id] = new Decimal(update.deducted)
				.add(currentDeduction)
				.toNumber();
		}

		// Log deduction details
		if (targetBalance !== undefined) {
			const entityInfo = entityId
				? `; Entity: ${entityId}`
				: "Entity: customer-level";
			ctx.logger.info(`[Sync]; Feature ${feature.id} | ${entityInfo}`, {
				data: {
					featureId: feature.id,
					entityInfo,
					totalDeducted,
					updates: Object.keys(updates).length,
					remaining: featureRemaining,
				},
			});
		} else {
			ctx.logger.info(
				`[Track]; Deducted ${totalDeducted} from feature ${feature.id}. Updated ${Object.keys(updates).length} entitlements. Remaining: ${featureRemaining}`,
			);
		}

		// Bill on Stripe for each updated entitlement
		const cusPrices = cusProductsToCusPrices({
			cusProducts: fullCus.customer_products,
		});

		for (const cusEntId of Object.keys(updates)) {
			const update = updates[cusEntId];
			const cusEnt = cusEnts.find((ce) => ce.id === cusEntId);

			if (!cusEnt) continue;

			// Calculate original negative balance
			const originalGrpBalance = getTotalNegativeBalance({
				cusEnt,
				balance: cusEnt.balance!,
				entities: cusEnt.entities!,
			});

			// Calculate new negative balance from updates
			const newGrpBalance = getTotalNegativeBalance({
				cusEnt,
				balance: update.balance,
				entities: update.entities,
			});

			const { newReplaceables, deletedReplaceables } = await adjustAllowance({
				db,
				env,
				org,
				cusPrices: cusPrices as any,
				customer: fullCus,
				affectedFeature: feature,
				cusEnt: cusEnt as any,
				originalBalance: originalGrpBalance,
				newBalance: newGrpBalance,
				logger: ctx.logger,
			});

			// Adjust balance based on replaceables
			let reUpdatedBalance = update.balance;

			if (newReplaceables && newReplaceables.length > 0) {
				reUpdatedBalance = reUpdatedBalance - newReplaceables.length;
			} else if (deletedReplaceables && deletedReplaceables.length > 0) {
				reUpdatedBalance = reUpdatedBalance + deletedReplaceables.length;
			}

			if (reUpdatedBalance !== update.balance) {
				await CusEntService.update({
					db,
					id: cusEntId,
					updates: {
						balance: reUpdatedBalance,
					},
				});

				// Update the updates object with the new balance
				updates[cusEntId].balance = reUpdatedBalance;
				updates[cusEntId].newReplaceables = newReplaceables ?? undefined;
				updates[cusEntId].deletedReplaceables =
					deletedReplaceables ?? undefined;
			}

			updateCusEntInFullCus({
				fullCus,
				cusEntId,
				update,
			});
		}
	}

	// Log summary of all Postgres deductions
	if (printLogs && Object.keys(actualDeductions).length > 0) {
		console.log("📊 Total Postgres deductions:", actualDeductions);
	}

	return {
		oldFullCus,
		fullCus,
		actualDeductions,
		remainingAmounts,
		isPaidAllocated,
	};
};

export const runDeductionTx = async (
	params: DeductionTxParams,
): Promise<{
	fullCus: FullCustomer | undefined;
	event: Event | undefined;
	actualDeductions: Record<string, number>;
}> => {
	const ctx = params.ctx;
	const { db } = ctx;

	let fullCus: FullCustomer | undefined;
	let event: Event | undefined;
	let actualDeductions: Record<string, number> = {};

	await db.transaction(
		async (tx) => {
			// Pass tx as the db connection
			const txParams = {
				...params,
				ctx: {
					...ctx,
					db: tx as unknown as typeof db,
				},
			};

			const result = await deductFromCusEnts(txParams);
			fullCus = result.fullCus;
			actualDeductions = result.actualDeductions;

			if (!fullCus) return;

			if (params.eventInfo) {
				const newEvent = constructEvent({
					ctx: txParams.ctx,
					eventInfo: params.eventInfo,
					internalCustomerId: fullCus.internal_id,
					internalEntityId: fullCus.entity?.internal_id,
					customerId: fullCus.id ?? "",
					entityId: fullCus.entity?.id,
				});

				event = await EventService.insert({
					db: tx as unknown as DrizzleCli,
					event: newEvent,
				});
			}

			if (params?.refreshCache && fullCus) {
				// 1. If paid allocated, delete cache
				if (result.isPaidAllocated) {
					await deleteCachedApiCustomer({
						customerId: fullCus.id ?? "",
						orgId: ctx.org.id,
						env: ctx.env,
					});
				} else {
					// Deduct the actual amounts from Redis cache (if exists)
					// This prevents race conditions by directly deducting the exact Postgres amount
					const { deductFromCache } = await import(
						"../redisTrackUtils/deductFromCache.js"
					);

					for (const [featureId, deductedAmount] of Object.entries(
						actualDeductions,
					)) {
						if (deductedAmount !== 0) {
							// Only deduct if something was actually deducted
							console.log(
								`Deducting from Redis cache: ${featureId}, ${deductedAmount}`,
							);
							await deductFromCache({
								ctx,
								customerId: fullCus.id ?? "",
								featureId,
								amount: deductedAmount,
								entityId: params.entityId,
							});
						}
					}

					// Log summary comparison
				}
			}
		},
		{
			isolationLevel: "read committed",
		},
	);

	return {
		fullCus,
		event,
		actualDeductions,
	};
};
