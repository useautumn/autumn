import { AppEnv } from "@autumn/shared";
import { getCardDataLive } from "../data/getCardData.js";
import type { CustomerCardData } from "../data/types.js";
import { env } from "../env.js";

export type ParsedCustomerLink = { customerId: string; env: AppEnv };

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
		return null;
	}
	return {
		customerId,
		env: match[1] ? AppEnv.Sandbox : AppEnv.Live,
	};
}

export async function resolveCustomer(
	orgId: string,
	customerId: string,
	customerEnv: AppEnv,
): Promise<CustomerCardData | null> {
	return getCardDataLive(orgId, customerId, customerEnv);
}
