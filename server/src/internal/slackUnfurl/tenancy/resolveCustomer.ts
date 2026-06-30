import { AppEnv } from "@autumn/shared";
import { getCardDataLive } from "../data/getCardData.js";
import type { CustomerCardData } from "../data/types.js";
import { env } from "../env.js";

export type ParsedCustomerLink = { customerId: string; env: AppEnv };

/**
 * Pull the customerId + env out of an Autumn customer-page URL, scoped to our
 * host. `/sandbox/customers/<id>` is sandbox; `/customers/<id>` is live.
 * Returns null for anything else.
 */
export function parseCustomerLink(rawUrl: string): ParsedCustomerLink | null {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (url.hostname !== env.APP_HOST) return null;
	const match = url.pathname.match(/^(\/sandbox)?\/customers\/([^/]+)\/?$/);
	if (!match) return null;
	let customerId: string;
	try {
		customerId = decodeURIComponent(match[2]);
	} catch {
		// Malformed percent-encoding — treat as a non-customer link.
		return null;
	}
	return {
		customerId,
		env: match[1] ? AppEnv.Sandbox : AppEnv.Live,
	};
}

/**
 * Resolve a customerId WITHIN an org + env. The org comes from the channel
 * mapping (never the URL/poster); the env comes from the URL path. So a typo'd /
 * probed id can only ever resolve inside the channel's own org. Backed by the
 * live Autumn store + Tinybird.
 */
export async function resolveCustomer(
	orgId: string,
	customerId: string,
	customerEnv: AppEnv,
): Promise<CustomerCardData | null> {
	return getCardDataLive(orgId, customerId, customerEnv);
}
