import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { AUTUMN_STRIPE_IDEMPOTENCY_PREFIX } from "../../stripe/common/autumnStripeIdempotency";

export const TW_STRIPE_IDEMPOTENCY_NAMESPACE_FILE =
	"/opt/autumn-tw/stripe-idempotency-namespace";

export const getTwStripeRequestHeaders = ({
	headers,
}: {
	headers: Record<string, string>;
}): Record<string, string> => {
	const keyHeader = Object.keys(headers).find(
		(name) => name.toLowerCase() === "idempotency-key",
	);
	if (!keyHeader || !headers[keyHeader]) return headers;

	// Resumed snapshot processes retain their old env; boot supplies their namespace on disk.
	const namespace =
		process.env.TW_STRIPE_IDEMPOTENCY_NAMESPACE ??
		(existsSync(TW_STRIPE_IDEMPOTENCY_NAMESPACE_FILE)
			? readFileSync(TW_STRIPE_IDEMPOTENCY_NAMESPACE_FILE, "utf8").trim()
			: undefined);
	if (!namespace) return headers;

	const key = headers[keyHeader];
	const prefix = key.startsWith(AUTUMN_STRIPE_IDEMPOTENCY_PREFIX)
		? AUTUMN_STRIPE_IDEMPOTENCY_PREFIX
		: "";
	const digest = createHash("sha256")
		.update(JSON.stringify([namespace, key]))
		.digest("hex");
	return { ...headers, [keyHeader]: `${prefix}tw:${digest}` };
};
