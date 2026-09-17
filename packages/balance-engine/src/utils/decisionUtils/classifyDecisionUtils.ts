import type {
	Decision,
	UnsupportedDecision,
} from "../../models/common/decision.js";

// Positional: a type predicate cannot narrow through a destructured parameter.
export const isUnsupportedDecision = <Supported extends { kind: string }>(
	decision: Decision<Supported>,
): decision is UnsupportedDecision => decision.kind === "unsupported";
