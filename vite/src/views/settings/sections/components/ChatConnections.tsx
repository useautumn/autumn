import { AppEnv, ChatAuthMode, type ScopeString } from "@autumn/shared";
import { Button } from "@autumn/ui";
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
import { SlackScopesSheet } from "./SlackScopesSheet";

type SlackInstallation = {
	provider: "slack";
	connected: true;
	workspace_name: string;
	default_env: AppEnv;
	auth_mode: ChatAuthMode | null;
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

	const installation = data?.installations.find(
		(item) => item.provider === "slack",
	);

	return (
		<div className="flex flex-col gap-3">
			<span className="text-sm font-medium text-foreground">Connections</span>
			{providers.map((provider) => {
				const isDisconnecting =
					disconnect.isPending && disconnect.variables === provider.id;
				return (
					<div
						key={provider.id}
						className="flex items-center justify-between gap-4 rounded-lg border bg-background p-4"
					>
						<div className="flex items-center gap-3">
							<FontAwesomeIcon
								icon={provider.icon}
								className="size-5 shrink-0 text-muted-foreground"
							/>
							<div className="flex flex-col gap-0.5">
								<span className="text-sm font-medium">
									{provider.name} chat
								</span>
								<span className="text-xs text-muted-foreground">
									{installation
										? installation.needs_reconnect
											? `Reconnect required for ${installation.workspace_name}`
											: `Connected to ${installation.workspace_name} (${installation.default_env})`
										: provider.description}
								</span>
							</div>
						</div>
						<div className="flex gap-2">
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
								variant={
									installation && !installation.needs_reconnect
										? "secondary"
										: "primary"
								}
								onClick={() => setSheetOpen(true)}
								isLoading={isLoading}
							>
								{installation ? "Reconnect" : `Add ${provider.name}`}
							</Button>
						</div>
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
		</div>
	);
};
