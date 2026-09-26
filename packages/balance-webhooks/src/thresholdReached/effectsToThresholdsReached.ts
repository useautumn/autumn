import type { MutationEffect } from "@autumn/balance-engine";
import { WebhookEventType } from "@autumn/shared";
import type { ThresholdReached } from "./types/thresholdReached.js";

/** Reads only the field it needs: a schema parse per effect would cost every track. */
const readFeatureId = (data: unknown): string | null => {
	if (typeof data !== "object" || data === null) return null;
	if (!("feature_id" in data) || typeof data.feature_id !== "string")
		return null;
	return data.feature_id;
};

/** A feature that went from allowed to refused: the decision `balances.limit_reached` already made. */
const effectToLimitReached = (
	effect: MutationEffect,
): ThresholdReached | null => {
	if (effect.type !== "balance_webhook") return null;
	if (effect.eventType !== WebhookEventType.BalancesLimitReached) return null;
	const featureId = readFeatureId(effect.data);
	if (!featureId) return null;
	return { featureId, type: "limit_reached" };
};

/** The thresholds a worker track crossed, read off the effects its decision produced. */
export const effectsToThresholdsReached = ({
	effects,
}: {
	effects: MutationEffect[];
}): ThresholdReached[] =>
	effects.flatMap((effect) => effectToLimitReached(effect) ?? []);
