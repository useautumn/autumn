import { FeatureNotFoundError } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "./balanceWorkerRequestContext.js";

/** The catalog internal id the worker attributes credit usage under. */
export function featureToInternalFeatureId({
	ctx,
	featureId,
}: {
	ctx: BalanceWorkerRequestContext;
	featureId: string;
}): string {
	const feature = ctx.features.find((candidate) => candidate.id === featureId);
	if (!feature) throw new FeatureNotFoundError({ featureId });
	return feature.internal_id;
}
