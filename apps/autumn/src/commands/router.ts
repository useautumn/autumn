import type { SlashCommandEvent } from "chat";
import { handleConnectCommand } from "@/commands/connect";
import { handleDisconnectCommand } from "@/commands/disconnect";
import { getWorkspaceId, isRedisUnavailable, isSlackNotInChannel } from "@/lib/slack";

export async function handleSlashCommandByName(event: SlashCommandEvent): Promise<void> {
	const command = (event.command || "").toLowerCase();

	try {
		const workspaceId = getWorkspaceId(event);

		console.log(
			`command ${command} org=${workspaceId ?? "unknown"} user=${event.user.userId} channel=${event.channel.id}`,
		);

		if (!workspaceId) {
			console.warn(
				`command ${command} err=no_workspace raw_keys=${event.raw ? Object.keys(event.raw as Record<string, unknown>).join(",") : "none"}`,
			);
			await event.channel.postEphemeral(
				event.user,
				"Could not identify this workspace. Try reinstalling Autumn.",
				{ fallbackToDM: true },
			);
			return;
		}

		switch (command) {
			case "/connect":
				return await handleConnectCommand(event, workspaceId);
			case "/disconnect":
				return await handleDisconnectCommand(event, workspaceId);
			default:
				await event.channel.postEphemeral(event.user, "Mention @Autumn to interact with billing.", {
					fallbackToDM: true,
				});
		}
	} catch (err) {
		if (isRedisUnavailable(err)) {
			await event.channel.postEphemeral(
				event.user,
				"Autumn is temporarily unavailable because Redis is offline. Try again in a minute.",
				{ fallbackToDM: true },
			);
			return;
		}
		if (isSlackNotInChannel(err)) {
			await event.channel.postEphemeral(
				event.user,
				"Invite Autumn to this channel first, then try again.",
				{ fallbackToDM: true },
			);
			return;
		}
		console.error("Command error:", err);
		await event.channel.postEphemeral(
			event.user,
			"Something went wrong running this command. Check the logs.",
			{ fallbackToDM: true },
		);
	}
}
