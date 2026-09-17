import { createHash } from "node:crypto";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "@/external/stripe/common/autumnStripeIdempotency";

const stableStringify = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, entryValue]) => entryValue !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(
				([key, entryValue]) =>
					`${JSON.stringify(key)}:${stableStringify(entryValue)}`,
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
};

/**
 * Deterministic per invoice, observed state and exact request, so the same
 * write from two deliveries dedupes at Stripe while any change in what is
 * on the invoice or in the line params gets a fresh key. `salt` is the
 * request id of a replayed cached failure, which every observer derives alike.
 */
export const buildInvoiceAddLinesIdempotencyKey = ({
	invoiceId,
	existingLineItemIds,
	requestParams,
	salt,
}: {
	invoiceId: string;
	existingLineItemIds: Iterable<string>;
	requestParams: unknown;
	salt?: string;
}): string => {
	const requestHash = createHash("sha256")
		.update([...existingLineItemIds].sort().join("\n"))
		.update("\n--\n")
		.update(stableStringify(requestParams))
		.digest("hex");
	const base = `${AUTUMN_STRIPE_IDEMPOTENCY_PREFIX}invoice.addLines:${invoiceId}:${requestHash}`;
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
