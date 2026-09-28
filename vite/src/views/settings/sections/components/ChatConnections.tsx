import {
	AppEnv,
	ChatAuthMode,
	ChatReplyMode,
	type ScopeString,
} from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { OrgService } from "@/services/OrgService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "../../components/SettingsGroup";
import { SettingsListRow } from "../../components/SettingsListRow";
import { SlackScopesSheet } from "./SlackScopesSheet";

type SlackInstallation = {
	provider: "slack";
	connected: true;
	workspace_name: string;
	default_env: AppEnv;
	auth_mode: ChatAuthMode | null;
	reply_mode: ChatReplyMode;
	agent_scopes: ScopeString[];
	needs_reconnect?: boolean;
	updated_at: number;
};

type ChatStatus =
	| { installations: [] }
	| { installations: SlackInstallation[] };

const providers = [
	{
		id: "slack",
		name: "Slack",
		description: "Use Autumn MCP tools from Slack DMs and mentions",
		icon: faSlack,
	},
] as const;

type ChatProvider = (typeof providers)[number]["id"];

export const ChatConnections = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const env = useEnv();
	const queryKey = ["chat"];
	const { data: session } = useSession();
	// better-auth's customSession additions aren't always inferred; cast to read
	// the caller's scopes (mirrors CreateApiKeySheet).
	const callerScopes = ((session as any)?.scopes ?? []) as string[];

	const [sheetOpen, setSheetOpen] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey,
		queryFn: async () => {
			const res = await OrgService.getChat(axiosInstance);
			return res.data as ChatStatus;
		},
	});

	const install = useMutation({
		mutationFn: async ({
			mode,
			scopes,
		}: {
			mode: ChatAuthMode;
			scopes: ScopeString[];
		}) => {
			const res = await OrgService.createChatInstall(axiosInstance, {
				provider: "slack",
				env: env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox,
				mode,
				scopes: mode === ChatAuthMode.Restricted ? scopes : undefined,
			});
			return res.data as { url: string };
		},
		onSuccess: ({ url }) => {
			window.location.assign(url);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to start chat install"));
		},
	});

	const disconnect = useMutation({
		mutationFn: async (provider: ChatProvider) => {
			await OrgService.disconnectChat(axiosInstance, provider);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey });
			toast.success("Chat disconnected");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to disconnect chat"));
		},
	});

	const updateReplyMode = useMutation({
		mutationFn: async (replyMode: ChatReplyMode) => {
			await OrgService.updateChatSettings(axiosInstance, "slack", {
				reply_mode: replyMode,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update chat settings"));
		},
	});

	const installation = data?.installations.find(
		(item) => item.provider === "slack",
	);

	const isConnected = !!installation && !installation.needs_reconnect;

	return (
		<SettingsGroup
			title="Connections"
			description="Chat with the agent from your team's workspace."
		>
			{providers.map((provider) => {
				const isDisconnecting =
					disconnect.isPending && disconnect.variables === provider.id;
				return (
					<div key={provider.id} className={SETTINGS_LIST_CLASS}>
						<SettingsListRow
							title={provider.name}
							leading={
								<span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
									<FontAwesomeIcon
										icon={provider.icon}
										className="size-4 text-muted-foreground"
									/>
								</span>
							}
							description={
								installation
									? installation.needs_reconnect
										? `Reconnect required for ${installation.workspace_name}`
										: `${installation.workspace_name} · ${installation.default_env}`
									: provider.description
							}
						>
							<span className="flex w-[84px] shrink-0">
								{isConnected && (
									<span className="flex items-center gap-1.5 font-medium text-emerald-500 text-xs">
										<span className="size-1.5 rounded-full bg-emerald-500" />
										Connected
									</span>
								)}
							</span>
							<div className="flex shrink-0 gap-2">
								{installation && (
									<Button
										variant="secondary"
										onClick={() => disconnect.mutate(provider.id)}
										isLoading={isDisconnecting}
									>
										Disconnect
									</Button>
								)}
								<Button
									variant={isConnected ? "secondary" : "primary"}
									onClick={() => setSheetOpen(true)}
									isLoading={isLoading}
								>
									{installation ? "Reconnect" : `Add ${provider.name}`}
								</Button>
							</div>
						</SettingsListRow>
						{installation && (
							<SettingsListRow
								title="Reply only when @-mentioned"
								description="In threads it has joined, the agent stays quiet unless tagged. It still reads along."
							>
								<Switch
									aria-label="Reply only when @-mentioned"
									checked={
										(updateReplyMode.isPending
											? updateReplyMode.variables
											: installation.reply_mode) === ChatReplyMode.MentionsOnly
									}
									disabled={updateReplyMode.isPending}
									onCheckedChange={(checked) =>
										updateReplyMode.mutate(
											checked
												? ChatReplyMode.MentionsOnly
												: ChatReplyMode.AllMessages,
										)
									}
								/>
							</SettingsListRow>
						)}
					</div>
				);
			})}

			<SlackScopesSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				initialMode={installation?.auth_mode}
				initialScopes={installation?.agent_scopes}
				callerScopes={callerScopes}
				isReconnect={!!installation}
				isSubmitting={install.isPending}
				onConfirm={(args) => install.mutate(args)}
			/>
		</SettingsGroup>
	);
};
