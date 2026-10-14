import { env } from "../env.js";
import { signCardToken } from "../render/cardToken.js";
import { resolveChannelToOrg } from "../tenancy/channelOrgMap.js";
import {
	type ParsedCustomerLink,
	parseCustomerLink,
	resolveCustomer,
} from "../tenancy/resolveCustomer.js";
import { type UnfurlCard, unfurlCards } from "./client.js";

type LinkSharedEvent = {
	type: "link_shared";
	channel: string;
	message_ts: string;
	unfurl_id: string;
	source: "composer" | "conversations_history";
	links: Array<{ url: string; domain: string }>;
};

export type SlackEventEnvelope = {
	type: "url_verification" | "event_callback";
	challenge?: string;
	event?: { type?: string } & Partial<LinkSharedEvent>;
};

const isLinkShared = (
	event: SlackEventEnvelope["event"],
): event is LinkSharedEvent =>
	event?.type === "link_shared" &&
	Array.isArray(event.links) &&
	typeof event.channel === "string" &&
	typeof event.unfurl_id === "string" &&
	(event.source === "composer" || event.source === "conversations_history");

export async function handleLinkShared(
	event: SlackEventEnvelope["event"],
): Promise<void> {
	if (!isLinkShared(event)) return;

	const orgId = resolveChannelToOrg(event.channel);
	if (!orgId) {
		console.info(`[slack-unfurl] unmapped channel ${event.channel}, skipping`);
		return;
	}

	const seen = new Set<string>();
	const links: Array<{ url: string } & ParsedCustomerLink> = [];
	for (const link of event.links) {
		const parsed = parseCustomerLink(link.url);
		if (!parsed) continue;
		const key = `${parsed.env}:${parsed.customerId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({ url: link.url, ...parsed });
		if (links.length >= MAX_CARDS) break;
	}
	if (links.length === 0) return;

	const resolved = (
		await Promise.all(
			links.map(async (link) => {
				try {
					const data = await resolveCustomer(orgId, link.customerId, link.env);
					if (data) return { ...link, name: data.name };
					console.info(
						`[slack-unfurl] ${link.customerId} not in ${orgId} (${link.env}), skipping`,
					);
				} catch (error) {
					console.warn(
						`[slack-unfurl] resolve failed for ${link.url}: ${String(error)}`,
					);
				}
				return null;
			}),
		)
	).filter(
		(link): link is { url: string; name: string } & ParsedCustomerLink =>
			link !== null,
	);

	if (resolved.length === 0) return;

	const HOUR_MS = 3_600_000;
	const hourBucket = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
	const token = signCardToken({
		orgId,
		items: resolved.map((link) => ({
			customerId: link.customerId,
			env: link.env,
		})),
	});
	const card: UnfurlCard = {
		url: resolved[0].url,
		imageUrl: `${env.AUTUMN_PUBLIC_API_URL}/slack-unfurl/cards/${token}.png?v=${hourBucket}`,
		altText: resolved
			.map((link) => link.name)
			.join(", ")
			.slice(0, 2000),
	};

	await unfurlCards({
		unfurlId: event.unfurl_id,
		source: event.source,
		cards: [card],
	});
}

const MAX_CARDS = 3;
