import type { SlashCommandEvent } from "chat";
import { deleteWorkspace, getWorkspace } from "@/services/workspace";

export async function handleDisconnectCommand(
	event: SlashCommandEvent,
	workspaceId: string,
): Promise<void> {
	const workspace = await getWorkspace(workspaceId);

	if (!workspace) {
		await event.channel.postEphemeral(
			event.user,
			"Autumn is not configured for this workspace yet, so there is nothing to disconnect.",
			{ fallbackToDM: true },
		);
		return;
	}

	if (workspace.connectedByUserId !== event.user.userId) {
		await event.channel.postEphemeral(
			event.user,
			"Only the admin who connected Autumn can disconnect it. Ask them to run `/disconnect`.",
			{ fallbackToDM: true },
		);
		return;
	}

	await deleteWorkspace(workspaceId);
	await event.channel.post("Autumn has been disconnected from this workspace.");
}
