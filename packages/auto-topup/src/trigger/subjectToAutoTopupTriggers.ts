import { deduplicateArray } from "@autumn/shared";
import { subjectToAutoTopupObjects } from "./subjectToAutoTopupObjects.js";
import { subjectToFeatureRows } from "./subjectToFeatureRows.js";
import { resolveThresholdSettlement } from "./thresholdBilling/resolveThresholdSettlement.js";
import type { AutoTopupSubject } from "./types/autoTopupSubject.js";
import type { AutoTopupTrigger } from "./types/autoTopupTrigger.js";

/** A deduction on a feature also moves every credit system that funds it, so each is a candidate. */
export const subjectToAutoTopupFeatureIds = ({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: AutoTopupSubject;
	featureId: string;
	now: number;
}): string[] =>
	deduplicateArray([
		featureId,
		...subjectToFeatureRows({
			fullSubject,
			fundsFeatureId: featureId,
			now,
		}).map((row) => row.entitlement.feature.id),
	]);

/** Whether one feature's job should run: its balance sits at or under its threshold, or threshold billing has a chunk to settle. */
export const subjectToAutoTopupTrigger = ({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: AutoTopupSubject;
	featureId: string;
	now: number;
}): AutoTopupTrigger | null => {
	const resolved = subjectToAutoTopupObjects({ fullSubject, featureId, now });
	if (resolved?.balanceBelowThreshold) {
		return {
			featureId,
			reason: "balance_below_threshold",
			autoTopupConfig: resolved.autoTopupConfig,
		};
	}
	const settlement = resolveThresholdSettlement({
		fullSubject,
		featureId,
		now,
	});
	if (settlement.kind !== "settle") return null;
	return {
		featureId,
		reason: "threshold_settlement",
		autoTopupConfig: resolved?.autoTopupConfig,
	};
};

/** Every feature a deduction on `featureId` should top up now, the tracked feature first. */
export const subjectToAutoTopupTriggers = ({
	fullSubject,
	featureId,
	now,
}: {
	fullSubject: AutoTopupSubject;
	featureId: string;
	now: number;
}): AutoTopupTrigger[] => {
	const triggers: AutoTopupTrigger[] = [];
	for (const candidateId of subjectToAutoTopupFeatureIds({
		fullSubject,
		featureId,
		now,
	})) {
		const trigger = subjectToAutoTopupTrigger({
			fullSubject,
			featureId: candidateId,
			now,
		});
		if (trigger) triggers.push(trigger);
	}
	return triggers;
};
