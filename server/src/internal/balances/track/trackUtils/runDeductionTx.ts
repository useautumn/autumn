import {
	CusProductStatus,
	cusProductsToCusEnts,
	cusProductsToPrices,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "../../../../db/initDrizzle.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { handleThresholdReached } from "../../../../trigger/handleThresholdReached.js";
import {
	deductAllowanceFromCusEnt,
	deductFromUsageBasedCusEnt,
} from "../../../../trigger/updateBalanceTask.js";
import { EventService } from "../../../api/events/EventService.js";
import { CusService } from "../../../customers/CusService.js";
import { refreshCusCache } from "../../../customers/cusCache/updateCachedCus.js";
import { deductFromApiCusRollovers } from "../../../customers/cusProducts/cusEnts/cusRollovers/rolloverDeductionUtils.js";
import { constructEvent, type EventInfo } from "./eventUtils.js";
import type { FeatureDeduction } from "./getFeatureDeductions.js";
import { validateDeductionPossible } from "./validateDeductionPossible.js";

export type DeductionTxParams = {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	deductions: FeatureDeduction[];
	eventInfo: EventInfo;
};

// const { cusEnts, cusPrices } = await getCusEntsInFeatures({
// 	customer,
// 	internalFeatureIds: features.map((f) => f.internal_id!),
// 	logger,
// 	reverseOrder: org.config?.reverse_deduction_order,
// });

const deductFromCusEnts = async ({
	ctx,
	customerId,
	entityId,
	deductions,
}: DeductionTxParams) => {
	const { db, org, env } = ctx;

	const customer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId,
		withSubs: true,
	});

	const cusEnts = cusProductsToCusEnts({
		cusProducts: customer.customer_products,
		featureIds: deductions.map((d) => d.feature.id),
		reverseOrder: org.config?.reverse_deduction_order,
	});

	const cusPrices = cusProductsToPrices({
		cusProducts: cusEnts.map((cusEnt) => cusEnt.customer_product),
	});

	if (cusEnts.length === 0) return;

	validateDeductionPossible({ cusEnts, deductions, entityId });

	const originalCusEnts = structuredClone(cusEnts);
	for (const obj of deductions) {
		const { feature, deduction } = obj;
		let toDeduct = deduction;

		for (const cusEnt of cusEnts) {
			if (cusEnt.entitlement.internal_feature_id !== feature.internal_id) {
				continue;
			}

			toDeduct = await deductFromApiCusRollovers({
				toDeduct,
				cusEnt,
				deductParams: {
					db,
					feature,
					env,
					entity: customer.entity ? customer.entity : undefined,
				},
			});

			if (toDeduct === 0) continue;

			toDeduct = await deductAllowanceFromCusEnt({
				toDeduct,
				cusEnt,
				deductParams: {
					db,
					feature,
					env,
					org,
					cusPrices: cusPrices as any[],
					customer,
					entity: customer.entity,
				},
				featureDeductions: deductions,
				willDeductCredits: true,
				setZeroAdjustment: true,
			});
		}

		if (toDeduct !== 0) {
			await deductFromUsageBasedCusEnt({
				toDeduct,
				cusEnts,
				deductParams: {
					db,
					feature,
					env,
					org,
					cusPrices: cusPrices as any[],
					customer,
					entity: customer.entity,
				},
				setZeroAdjustment: true,
			});
		}

		handleThresholdReached({
			org,
			env,
			features: ctx.features,
			db,
			feature,
			cusEnts: originalCusEnts,
			newCusEnts: cusEnts,
			fullCus: customer,
			logger: ctx.logger,
		});

		// Insert event into database
		return customer;
	}
};

export const runDeductionTx = async (params: DeductionTxParams) => {
	const ctx = params.ctx;
	const { db, org, env, logger } = ctx;

	await db.transaction(
		async (tx) => {
			// Acquire advisory lock for this customer (and entity if provided) to serialize concurrent requests
			// Include entity_id in lock key so different entities can update concurrently
			const lockKeyStr = `${params.customerId}_${org.id}_${env}${params.entityId ? `_${params.entityId}` : ""}`;

			const hash =
				lockKeyStr.split("").reduce((acc, char) => {
					return (acc << 5) - acc + char.charCodeAt(0);
				}, 0) | 0; // Convert to 32-bit integer

			logger.info(`Acquiring advisory lock (hash=${hash}) for: ${lockKeyStr}`);

			// Time this
			const start = Date.now();
			await tx.execute(sql`SELECT pg_advisory_xact_lock(${hash})`);
			const elapsed = Date.now() - start;

			logger.info(`Advisory lock acquired in ${elapsed}ms`);

			const customer = await deductFromCusEnts(params);

			if (!customer) return;

			if (params.eventInfo) {
				const newEvent = await constructEvent({
					ctx,
					eventInfo: params.eventInfo,
					fullCus: customer,
				});

				await EventService.insert({
					db: tx as unknown as DrizzleCli,
					event: newEvent,
				});
			}

			// return await updateUsage({
			// 	db: tx as unknown as DrizzleCli,
			// 	customerId,
			// 	features,
			// 	value,
			// 	properties,
			// 	org,
			// 	env,
			// 	setUsage: set_usage,
			// 	logger,
			// 	entityId,
			// 	allFeatures,
			// });
		},
		{
			isolationLevel: "read committed",
		},
	);

	await refreshCusCache({
		db,
		customerId: params.customerId,
		entityId: params.entityId,
		org,
		env,
	});
};
