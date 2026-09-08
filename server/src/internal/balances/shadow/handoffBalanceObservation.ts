import type { LuaDeductionResult } from "../utils/types/redisDeductionResult.js";
import {
	type BalanceObservationCapture,
	type BalanceObservationContext,
	balanceObservationSchema,
} from "./balanceObservation.js";

export function reportBalanceObservationFailure({
	capture,
	context,
	reason,
}: {
	capture: BalanceObservationCapture;
	context: BalanceObservationContext;
	reason: string;
}): void {
	try {
		capture.onUnavailable({ ...context, reason });
	} catch {
		/* Observability must not change a production deduction. */
	}
}

export function handoffBalanceObservation({
	capture,
	context,
	result,
}: {
	capture: BalanceObservationCapture;
	context: BalanceObservationContext;
	result: LuaDeductionResult;
}): void {
	if (
		[
			"SUBJECT_VIEW_CHANGED",
			"SUBJECT_BALANCE_NOT_FOUND",
			"LOCK_ALREADY_EXISTS",
		].includes(result.error ?? "")
	)
		return;
	let reason: string;
	try {
		const parsed = balanceObservationSchema.safeParse(result.observation);
		if (!parsed.success)
			reason = result.observation_error ?? "observation_invalid_or_missing";
		else if (
			Object.entries(context).some(
				([key, value]) =>
					parsed.data[key as keyof BalanceObservationContext] !== value,
			)
		)
			reason = "observation_identity_mismatch";
		else if (capture.tryEnqueue(parsed.data)) return;
		else reason = "observation_dropped";
	} catch {
		reason = "observer_failed";
	}
	reportBalanceObservationFailure({ capture, context, reason });
}
