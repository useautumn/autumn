import { type LinkUnfurls, WebClient } from "@slack/web-api";
import { env } from "../env.js";

export const slack = new WebClient(env.SLACK_BOT_TOKEN);

export type UnfurlCard = { url: string; imageUrl: string; altText: string };

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
