import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";

/** What a check decided, on the root span. A denial sets `maple.keep`, so a sampled check trace is never dropped. */
export const setCheckSpanAttributes = ({
	featureId,
	allowed,
	requiredBalance,
	balance,
	denyReason,
	failOpen,
}: {
	featureId: string | undefined;
	allowed: boolean;
	requiredBalance: number;
	/** What remains; absent for a flag or when nothing is attached. */
	balance?: number;
	denyReason?: string | null;
	failOpen?: boolean;
}) =>
	setRootSpanAttributes({
		"check.feature_id": featureId,
		"check.allowed": allowed,
		"check.required_balance": requiredBalance,
		"check.balance": balance,
		"check.deny_reason": allowed ? undefined : (denyReason ?? undefined),
		"check.fail_open": failOpen || undefined,
		"maple.keep": allowed && !failOpen ? undefined : true,
	});
