import type { MutationEffect } from "@autumn/balance-engine";
import { WebhookEventType } from "@autumn/shared";
import type { ThresholdReached } from "./types/thresholdReached.js";

const readFeatureId = (data: unknown): string | null => {
	if (typeof data !== "object" || data === null) return null;
	if (!("feature_id" in data) || typeof data.feature_id !== "string")
		return null;
	return data.feature_id;
};

const effectToLimitReached = (
	effect: MutationEffect,
): ThresholdReached | null => {
	if (effect.type !== "balance_webhook") return null;
	if (effect.eventType !== WebhookEventType.BalancesLimitReached) return null;
	const featureId = readFeatureId(effect.data);
	if (!featureId) return null;
	return { featureId, type: "limit_reached" };
};

export const effectsToThresholdsReached = ({
	effects,
}: {
	effects: MutationEffect[];
}): ThresholdReached[] =>
	effects.flatMap((effect) => effectToLimitReached(effect) ?? []);
