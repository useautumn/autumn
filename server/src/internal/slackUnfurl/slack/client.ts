import { type LinkUnfurls, WebClient } from "@slack/web-api";
import { env } from "../env.js";

export const slack = new WebClient(env.SLACK_BOT_TOKEN);

export type UnfurlCard = { url: string; imageUrl: string; altText: string };

/**
 * Post one or more rendered cards as link unfurls in a single call — works
 * WITHOUT the bot being a member of the channel (unlike chat.postMessage /
 * files.uploadV2). Uses the membership-free `unfurl_id` + `source` from the
 * link_shared event. Each image block points at our own server-served PNG, since
 * unfurl image blocks need a public image_url.
 */
export async function unfurlCards({
	unfurlId,
	source,
	cards,
}: {
	unfurlId: string;
	source: "composer" | "conversations_history";
	cards: UnfurlCard[];
}): Promise<void> {
	if (cards.length === 0) return;
	const unfurls: LinkUnfurls = {};
	for (const card of cards) {
		unfurls[card.url] = {
			blocks: [
				{ type: "image", image_url: card.imageUrl, alt_text: card.altText },
			],
		};
	}
	await slack.chat.unfurl({ unfurl_id: unfurlId, source, unfurls });
}
