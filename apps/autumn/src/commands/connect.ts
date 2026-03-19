import type { SlashCommandEvent } from "chat";
import { Actions, Card, LinkButton, CardText as Text } from "chat";
import { getEnv } from "@/config";
import { getWorkspace } from "@/services/workspace";

export async function handleConnectCommand(
	event: SlashCommandEvent,
	workspaceId: string,
): Promise<void> {
	const existing = await getWorkspace(workspaceId);
	if (existing?.apiKey) {
		const canManageConnection = existing.connectedByUserId === event.user.userId;

		if (!canManageConnection) {
			await event.channel.postEphemeral(
				event.user,
				"Autumn is already connected. Only the admin who set it up can reconnect, ask them to run `/disconnect` first.",
				{ fallbackToDM: true },
			);
			return;
		}

		await event.channel.postEphemeral(
			event.user,
			"Autumn is already connected. Run `/disconnect` first if you want to reconnect.",
			{ fallbackToDM: true },
		);
		return;
	}

	const env = getEnv();
	const connectUrl = `${env.BASE_URL}/connect?workspace_id=${workspaceId}&user_id=${event.user.userId}`;

	await event.channel.post(
		Card({
			title: "",
			children: [
				Text("*Autumn Commands*"),
				Text("To connect to Autumn, click the button below and complete the browser flow."),
				Text("When you're done, return to Slack and mention @Autumn to get started."),
				Actions([LinkButton({ label: "Connect Autumn", url: connectUrl, style: "primary" })]),
			],
		}),
	);
}
