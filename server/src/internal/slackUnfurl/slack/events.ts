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

/**
 * Runs AFTER the 3s ack, asynchronously. Resolves tenancy strictly by channel,
 * validates customer ownership, renders, and unfurls. Unfurling needs no channel
 * membership. Any failure is swallowed with a log — a probed/typo'd link simply
 * produces no card.
 */
export async function handleLinkShared(
	event: SlackEventEnvelope["event"],
): Promise<void> {
	if (!isLinkShared(event)) return;

	const orgId = resolveChannelToOrg(event.channel);
	if (!orgId) {
		// Unmapped channel: decline to render. Never guess a tenant.
		console.info(`[slack-unfurl] unmapped channel ${event.channel}, skipping`);
		return;
	}

	// Parse + dedupe customer links, cap at MAX_CARDS — they render side-by-side
	// into ONE composite image, so beyond a few they'd be unreadable anyway.
	const seen = new Set<string>();
	const links: Array<{ url: string } & ParsedCustomerLink> = [];
	for (const link of event.links) {
		const parsed = parseCustomerLink(link.url);
		if (!parsed) continue;
		// Dedupe by the resolved customer, not the raw url — query-string variants
		// of the same customer would otherwise each eat a card slot.
		const key = `${parsed.env}:${parsed.customerId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({ url: link.url, ...parsed });
		if (links.length >= MAX_CARDS) break;
	}
	if (links.length === 0) return;

	// Resolve every link concurrently; each runs on its own org+env-scoped ctx.
	// We resolve here only to decide what to include + name the alt text; the
	// /cards route re-resolves and renders.
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

	// ONE token carries all resolved customers -> ONE composite image, attached to
	// the first resolved link. `?v` is pinned to the top of the current UTC hour
	// so the url is stable for an hour (Slack/CDN reuse the render).
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
		imageUrl: `${env.PUBLIC_BASE_URL}/slack-unfurl/cards/${token}.png?v=${hourBucket}`,
		// Slack rejects image blocks whose alt_text exceeds 2000 chars.
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
