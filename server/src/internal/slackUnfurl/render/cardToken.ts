import { createHmac, timingSafeEqual } from "node:crypto";
import { AppEnv } from "@autumn/shared";
import { env } from "../env.js";

/**
 * The card PNG is served from a PUBLIC url (Slack fetches it), so the token in
 * that url is HMAC-signed: only urls we minted resolve, and the tenant identity
 * (orgId + env) is baked in and signed — it can't be tampered to probe another
 * org/env. The route still re-runs ownership validation on every fetch.
 *
 * One token can carry up to 3 customers (one composite image, cards side-by-side).
 */
const MAX_ITEMS = 3;

type CardItem = { customerId: string; env: AppEnv };
type CardClaims = { orgId: string; items: CardItem[] };

const b64url = (input: string): string =>
	Buffer.from(input).toString("base64url");

const sign = (payload: string): string => {
	// Fail closed: an empty key would make the public card url forgeable.
	if (!env.SLACK_SIGNING_SECRET) {
		throw new Error("cardToken: ALU_SLACK_SIGNING_SECRET unset");
	}
	return createHmac("sha256", env.SLACK_SIGNING_SECRET)
		.update(payload)
		.digest("base64url")
		.slice(0, 24);
};

export function signCardToken(claims: CardClaims): string {
	const payload = b64url(JSON.stringify(claims));
	return `${payload}.${sign(payload)}`;
}

export function verifyCardToken(token: string): CardClaims | null {
	// Exactly `<payload>.<sig>` — extra delimiters would alias one card to many urls.
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [payload, sig] = parts;
	if (!(payload && sig)) return null;

	let expected: string;
	try {
		expected = sign(payload);
	} catch {
		return null;
	}
	const a = Buffer.from(expected);
	const b = Buffer.from(sig);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

	try {
		const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
		if (typeof parsed?.orgId !== "string" || !Array.isArray(parsed?.items)) {
			return null;
		}
		const items: CardItem[] = [];
		for (const item of parsed.items.slice(0, MAX_ITEMS)) {
			if (
				typeof item?.customerId === "string" &&
				(item?.env === AppEnv.Live || item?.env === AppEnv.Sandbox)
			) {
				items.push({ customerId: item.customerId, env: item.env });
			}
		}
		if (items.length === 0) return null;
		return { orgId: parsed.orgId, items };
	} catch {
		// fall through
	}
	return null;
}
