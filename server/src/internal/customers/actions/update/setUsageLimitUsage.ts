import {
	findFeatureById,
	findUsageWindowByLimit,
	fullSubjectToUsageWindowLimits,
	orgToInStatuses,
	RecaseError,
	type UsageLimitUpdate,
	type UsageWindow,
	usageLimitFilterKey,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { invalidateCachedFullSubject } from "../../cache/fullSubject/index.js";
import { getFullSubject } from "../../repos/getFullSubject/getFullSubject.js";
import { usageWindowRepo } from "../../usageWindows/repos/index.js";

export const setUsageLimitUsage = async ({
	ctx,
	customerId,
	entityId,
	usageLimits,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	usageLimits: UsageLimitUpdate[];
}): Promise<void> => {
	const usageUpdates = usageLimits.filter((entry) => entry.usage !== undefined);
	if (usageUpdates.length === 0) return;

	await invalidateCachedFullSubject({
		ctx,
		customerId,
		entityId,
		source: "setUsageLimitUsage:before",
		flushBalances: true,
	});

	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId,
		readFrom: "primary",
	});
	if (!fullSubject) return;

	const limits = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: usageUpdates.map((entry) => entry.feature_id),
		features: ctx.features,
		now: ctx.timestamp,
		inStatuses: orgToInStatuses({ org: ctx.org }),
	});
	const windows: Array<{ window: UsageWindow; usage: number }> = [];

	for (const entry of usageUpdates) {
		findFeatureById({
			features: ctx.features,
			featureId: entry.feature_id,
			errorOnNotFound: true,
		});
		const filterKey = usageLimitFilterKey(entry.filter);
		const limit = limits.find(
			(candidate) =>
				candidate.feature_id === entry.feature_id &&
				(candidate.filter_key || "") === filterKey,
		);
		if (entry.usage! > 0 && !limit) {
			throw new RecaseError({
				message: `No usage limit configured for feature ${entry.feature_id}`,
				statusCode: 400,
			});
		}

		const existing = limit
			? findUsageWindowByLimit({
					usageWindows: fullSubject.usage_windows ?? [],
					limit,
				})
			: (fullSubject.usage_windows ?? []).find(
					(window) =>
						window.feature_id === entry.feature_id &&
						(window.internal_entity_id ?? null) === (entityId ? fullSubject.entity?.internal_id ?? entityId : null) &&
						(window.filter_key || "") === filterKey,
				);
		if (!existing && entry.usage === 0) continue;
		if (!existing && limit) {
			windows.push({
				window: {
					id: generateId("uw"),
					internal_customer_id: limit.internal_customer_id,
					internal_entity_id: limit.internal_entity_id,
					feature_id: limit.feature_id,
					internal_feature_id: limit.internal_feature_id,
					filter_key: limit.filter_key,
					anchor_customer_entitlement_id: limit.anchor_customer_entitlement_id,
					window_start_at: limit.window_start_at,
					window_end_at: limit.window_end_at,
					usage: entry.usage!,
					updated_at: ctx.timestamp,
				},
				usage: entry.usage!,
			});
			continue;
		}
		if (existing) windows.push({ window: existing, usage: entry.usage! });
	}

	await usageWindowRepo.setWindows({ db: ctx.db, windows });
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		entityId,
		source: "setUsageLimitUsage:after",
	});
};
