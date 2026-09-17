import { createHash } from "node:crypto";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";

/**
 * Keyed on the invoice state that was observed (line ids already present),
 * not on what is about to be written: two overlapping deliveries that read
 * the same state share a key even if they computed different pending sets,
 * so Stripe replays or rejects the second instead of writing twice.
 * `salt` is the request id of a replayed cached failure, which every
 * observer of that failure reads from Stripe and derives alike.
 */
export const buildInvoiceAddLinesIdempotencyKey = ({
	invoiceId,
	existingLineItemIds,
	salt,
}: {
	invoiceId: string;
	existingLineItemIds: Iterable<string>;
	salt?: string;
}): string => {
	const observedStateHash = createHash("sha256")
		.update([...existingLineItemIds].sort().join("\n"))
		.digest("hex");
	const base = `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}invoice.addLines:${invoiceId}:${observedStateHash}`;
	return salt ? `${base}:${salt}` : base;
};

/** Stripe replayed a cached response; returns the request that produced it. */
export const getReplayedStripeRequestId = (
	error: unknown,
): string | undefined => {
	const stripeError = error as
		| { headers?: Record<string, string>; type?: string; rawType?: string }
		| undefined;
	// A key reused with different params is a fresh idempotency error, never a replay.
	const isIdempotencyError =
		stripeError?.type === "StripeIdempotencyError" ||
		stripeError?.rawType === "idempotency_error";
	if (!stripeError?.headers || isIdempotencyError) return undefined;
	if (stripeError.headers["idempotent-replayed"] !== "true") return undefined;
	return stripeError.headers["original-request"] || undefined;
};
