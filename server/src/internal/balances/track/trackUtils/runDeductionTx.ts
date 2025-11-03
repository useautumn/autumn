import type { Event } from "@autumn/shared";
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
	updateCusEntInFullCus,
} from "@autumn/shared";
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
import { refreshCachedApiCustomer } from "../../../customers/cusUtils/apiCusCacheUtils/refreshCachedApiCustomer.js";
import { getCreditCost } from "../../../features/creditSystemUtils.js";
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
};

const deductFromCusEnts = async ({
	ctx,
	customerId,
	entityId,
	deductions,
	overageBehaviour = "cap",
	addToAdjustment = false,
}: DeductionTxParams) => {
	const { db, org, env } = ctx;
	const fullCus = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId,
		withSubs: true,
	});

	const printLogs = false;

	if (printLogs) {
		console.log(
			`Deductions: 	`,
			deductions.map((d) => ({
				feature_id: d.feature.id,
				deduction: d.deduction,
			})),
		);
	}
	// Need to deduct from customer entitlement...
	for (const deduction of deductions) {
		const { feature, deduction: toDeduct } = deduction;

		const relevantFeatures = getRelevantFeatures({
			features: ctx.features,
			featureId: feature.id,
		});

		const cusEnts = cusProductsToCusEnts({
			cusProducts: fullCus.customer_products,
			featureIds: relevantFeatures.map((f) => f.id),
			reverseOrder: org.config?.reverse_deduction_order,
			entity: fullCus.entity,
		});

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

		// console.log("Cus ent input", cusEntInput);

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

		// Call the stored function to deduct from entitlements with credit costs
		const result = await db.execute(
			sql`SELECT * FROM deduct_allowance_from_entitlements(
				${JSON.stringify(cusEntInput)}::jsonb, 
				${toDeduct},
				${entityId || null},
				${rolloverIds.length > 0 ? sql.raw(`ARRAY[${rolloverIds.map((id) => `'${id}'`).join(",")}]`) : null}
			)`,
		);

		// Parse the JSONB result
		const resultJson = result[0]?.deduct_allowance_from_entitlements as {
			updates: Record<
				string,
				{
					balance: number;
					entities: any;
					adjustment: number;
					deducted: number;
				}
			>;
			remaining: number;
		};

		if (!resultJson) {
			throw new InternalError({
				message: "Failed to deduct from entitlements",
			});
		}

		const { updates, remaining } = resultJson;

		// Check if deduction was rejected due to limits
		if (remaining > 0 && overageBehaviour === "reject") {
			throw new InsufficientBalanceError({
				message: `Insufficient balance to deduct ${toDeduct}. Remaining: ${remaining}`,
			});
		}

		ctx.logger.info(
			`Deducted ${toDeduct - remaining} from feature ${feature.id}. Updated ${
				Object.keys(updates).length
			} entitlements. Remaining: ${remaining}`,
		);

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
			}

			updateCusEntInFullCus({
				fullCus,
				cusEntId,
				update,
			});
		}
	}

	return fullCus;
};

export const runDeductionTx = async (
	params: DeductionTxParams,
	refreshCache = true,
): Promise<{
	fullCus: FullCustomer | undefined;
	event: Event | undefined;
}> => {
	const ctx = params.ctx;
	const { db, org, env } = ctx;

	let fullCus: FullCustomer | undefined;
	let event: Event | undefined;

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

			fullCus = await deductFromCusEnts(txParams);

			if (!fullCus) return;

			if (params.eventInfo) {
				const newEvent = await constructEvent({
					ctx: txParams.ctx,
					eventInfo: params.eventInfo,
					fullCus,
				});

				event = await EventService.insert({
					db: tx as unknown as DrizzleCli,
					event: newEvent,
				});
			}
		},
		{
			isolationLevel: "read committed",
		},
	);

	if (refreshCache) {
		await refreshCachedApiCustomer({
			ctx,
			customerId: params.customerId,
			entityId: params.entityId,
		});
	}
	// await refreshCusCache({
	// 	db,
	// 	customerId: params.customerId,
	// 	entityId: params.entityId,
	// 	org,
	// 	env,
	// });

	return {
		fullCus,
		event,
	};
};
