import type { ActionEvent } from "chat";
import type { ReplyTarget } from "../../../ui/progress.js";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";
import {
	catalogDecisionSubmittedCard,
	parseCatalogDecisionButtonPayload,
} from "../presenters/interactionCards.js";

export const handleSlackCatalogDecision = async (event: ActionEvent) => {
	const payload = parseCatalogDecisionButtonPayload(event.value);
	if (!(payload && event.thread)) return;
	const thread = event.thread;
	const providerUserId = event.user.userId;
	try {
		await event.adapter.editMessage?.(
			event.threadId,
			event.messageId,
			catalogDecisionSubmittedCard({
				actorId: providerUserId,
				choiceLabel: payload.l,
				planName: payload.p,
			}),
		);
	} catch {}

	const decision = {
		migrationDraft: payload.m === 1,
		planId: payload.p,
		propagateVariantIds: payload.pv,
		versioning: payload.v,
	};
	const text = `I chose "${payload.l}" for ${payload.p} on the catalog decision card. Apply the change with these decisions.`;
	await dispatchSlackAgentMessage({
		channelId: thread.channelId,
		clientContext: { catalogDecision: decision },
		providerUserId,
		raw: event.raw,
		target: thread as unknown as ReplyTarget,
		text,
		threadId: event.threadId,
	});
};
