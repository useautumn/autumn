import type { SlashCommandEvent } from "chat";
import { dispatchSlackAgentMessage } from "../actions/dispatchSlackAgentMessage.js";

export const handleSlackSlashCommand = async (event: SlashCommandEvent) =>
	dispatchSlackAgentMessage({
		channelId: event.channel.id,
		providerUserId: event.user.userId,
		raw: event.raw,
		target: event.channel,
		text: event.text || event.command,
		threadId: event.channel.id,
	});
