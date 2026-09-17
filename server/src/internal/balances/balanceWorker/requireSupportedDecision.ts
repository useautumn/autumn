import { type Decision, isUnsupportedDecision } from "@autumn/balance-engine";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

/** The one place an unsupported worker decision becomes an API error. */
export function requireSupportedDecision<Supported extends { kind: string }>({
	decision,
}: {
	decision: Decision<Supported>;
}): Supported {
	if (isUnsupportedDecision(decision)) {
		throw new BalanceWorkerUnsupportedError({ reason: decision.reason });
	}
	return decision;
}
