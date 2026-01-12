import type { CustomerEntitlementFilters, Event } from "@autumn/shared";
import {
	CusProductStatus,
	cusEntToCusPrice,
	cusEntToMinBalance,
	cusEntToStartingBalance,
	cusProductsToCusEnts,
	FeatureUsageType,
	type FullCustomer,
	getRelevantFeatures,
	InternalError,
	notNullish,
	nullish,
	orgToInStatuses,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { EventService } from "../../../api/events/EventService.js";
import { CusService } from "../../../customers/CusService.js";
import { getUnlimitedAndUsageAllowed } from "../../../customers/cusProducts/cusEnts/cusEntUtils.js";
import { deleteCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { getCreditCost } from "../../../features/creditSystemUtils.js";
import { isPaidContinuousUse } from "../../../features/featureUtils.js";
import { type EventInfo, initEvent } from "../../events/initEvent.js";
import { applyDeductionUpdateToFullCustomer } from "../../utils/deduction/applyDeductionUpdateToFullCustomer.js";
import type { DeductionUpdate } from "../../utils/types/deductionUpdate.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handlePaidAllocatedCusEnt } from "./handlePaidAllocatedCusEnt.js";
import { rollbackDeduction } from "./rollbackDeduction.js";

export type DeductionTxParams = {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	deductions: FeatureDeduction[];
	eventInfo?: EventInfo;
	overageBehaviour?: "cap" | "reject" | "allow";
	addToAdjustment?: boolean;
	skipAdditionalBalance?: boolean;
	alterGrantedBalance?: boolean;
	fullCus?: FullCustomer; // if provided from function above!
	refreshCache?: boolean; // Whether to refresh Redis cache after deduction (default: true for track, false for sync)

	customerEntitlementFilters?: CustomerEntitlementFilters;
};

export const deductFromCusEntsPostgres = async ({
	ctx,
	customerId,
	entityId,
	deductions,
	overageBehaviour = "cap",
	addToAdjustment = false,
	skipAdditionalBalance = true,
	alterGrantedBalance = false,
	fullCus,
	customerEntitlementFilters,
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

	const isPaidAllocated = deductions.some((d) =>
		isPaidContinuousUse({
			feature: d.feature,
			fullCus: fullCus!,
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

		const relevantFeatures = notNullish(targetBalance)
			? [feature]
			: getRelevantFeatures({
					features: ctx.features,
					featureId: feature.id,
				});

		// For refunds (negative amounts), reverse usage_allowed sorting
		// so overage entitlements are processed first (to recover negative balance)
		const isRefund = (toDeduct ?? 0) < 0;

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureIds: relevantFeatures.map((f) => f.id),
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
			inStatuses: orgToInStatuses({ org }),
			customerEntitlementFilters,
			isRefund,
		});

		// Debug: log sort order
		console.log(`[runDeductionTx] toDeduct=${toDeduct}, isRefund=${isRefund}`);
		console.log(
			`[runDeductionTx] CusEnts:`,
			cusEnts.map((ce) => ({
				id: ce.id.slice(-8),
				usage_allowed: ce.usage_allowed,
				balance: ce.balance,
				interval: ce.entitlement.interval,
			})),
		);

		// Check if ANY relevant feature (primary or credit system) is unlimited
		// Add unlimited features to actualDeductions with value 0 (like Lua's changedCustomerFeatureIds)
		let unlimited = false;
		for (const rf of relevantFeatures) {
			const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
				cusEnts,
				internalFeatureId: rf.internal_id!,
			});
			if (featureUnlimited) {
				unlimited = true;
				// Add to actualDeductions with 0 so balance gets returned
				if (actualDeductions[rf.id] === undefined) {
					actualDeductions[rf.id] = 0;
				}
			}
		}

		if (cusEnts.length === 0 || unlimited) continue;

		const cusEntInput = cusEnts.map((ce) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: ce.entitlement.feature,
			});

			const minBalance = cusEntToMinBalance({ cusEnt: ce });
			const maxBalance = cusEntToStartingBalance({ cusEnt: ce });

			const cusPrice = cusEntToCusPrice({ cusEnt: ce });
			const isFreeAllocated =
				ce.entitlement.feature.config?.usage_type ===
					FeatureUsageType.Continuous && nullish(cusPrice);

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				entity_feature_id: ce.entitlement.entity_feature_id,
				usage_allowed:
					ce.usage_allowed ||
					(isFreeAllocated && overageBehaviour !== "reject"),
				add_to_adjustment: addToAdjustment,
				min_balance: minBalance,
				max_balance: maxBalance,
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
					overage_behaviour: overageBehaviour ?? "cap",
					feature_id: feature.id,
				})}::jsonb
			)`,
		);

		// Parse the JSONB result
		const resultJson = result[0]?.deduct_from_cus_ents as {
			updates: Record<string, DeductionUpdate>;
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

		try {
			for (const cusEntId of Object.keys(updates)) {
				const update = updates[cusEntId];
				const cusEnt = cusEnts.find((ce) => ce.id === cusEntId);

				if (!cusEnt) continue;

				await handlePaidAllocatedCusEnt({
					ctx,
					cusEnt,
					fullCus,
					updates,
				});

				applyDeductionUpdateToFullCustomer({
					fullCus,
					cusEntId,
					update,
				});
			}
		} catch (error) {
			if (error instanceof Error && !error?.message?.includes("declined")) {
				ctx.logger.error(
					`[deductFromCusEnts] Attempting rollback due to error: ${error}`,
				);
			}
			await rollbackDeduction({
				ctx,
				oldFullCus,
				updates,
			});
			throw error;
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

	const result = await deductFromCusEntsPostgres(params);
	fullCus = result.fullCus;
	actualDeductions = result.actualDeductions;

	if (!fullCus) {
		return {
			fullCus,
			event,
			actualDeductions,
		};
	}

	if (params.eventInfo) {
		const newEvent = initEvent({
			ctx,
			eventInfo: params.eventInfo,
			internalCustomerId: fullCus.internal_id,
			internalEntityId: fullCus.entity?.internal_id,
			customerId: fullCus.id ?? "",
			entityId: fullCus.entity?.id,
		});

		event = await EventService.insert({
			db,
			event: newEvent,
		});
	}

	if (params?.refreshCache && fullCus) {
		await deleteCachedApiCustomer({
			customerId: fullCus.id ?? "",
			ctx,
			source: `runDeductionTx, refreshing cache`,
		});
	}

	return {
		fullCus,
		event,
		actualDeductions,
	};
};
