import { AppEnv } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type SlackAdminInstallation = {
	id: string;
	workspace_id: string;
	workspace_name?: string | null;
	bot_user_id?: string | null;
	target_org_id: string;
	target_env: AppEnv;
	updated_at?: number | null;
	installed_by_user_id?: string | null;
	oauth_credentials?: SlackAdminOAuthCredential[];
};

type SlackAdminOAuthCredential = {
	id: string;
	env: AppEnv;
	oauth_client_id: string;
	oauth_consent_id?: string | null;
	access_token_expires_at: number;
	updated_at?: number | null;
};

type OrgSearchResult = {
	id: string;
	name?: string | null;
	slug?: string | null;
	createdAt: string;
};

type OrgSearchResponse = {
	rows: OrgSearchResult[];
	hasNextPage: boolean;
};

const queryKey = ["admin-slack-admin-bot"];

export const SlackAdminBotTab = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [targetOrgIdOrSlug, setTargetOrgIdOrSlug] = useState("");
	const [orgSearch, setOrgSearch] = useState("");
	const [targetEnv, setTargetEnv] = useState<AppEnv>(AppEnv.Live);
	const debouncedOrgSearch = useDebounce({
		value: orgSearch.trim(),
		delayMs: 250,
	});

	const { data, isLoading, refetch } = useQuery({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.get<{
				installation: SlackAdminInstallation | null;
			}>("/admin/chat/slack-admin");
			return data;
		},
	});

	const installation = data?.installation ?? null;
	const credentials = installation?.oauth_credentials ?? [];

	const { data: orgSearchData, isLoading: isSearchingOrgs } =
		useQuery<OrgSearchResponse>({
			queryKey: ["admin-slack-bot-org-search", debouncedOrgSearch],
			queryFn: async () => {
				const params = new URLSearchParams({ search: debouncedOrgSearch });
				const { data } = await axiosInstance.get<OrgSearchResponse>(
					`/admin/orgs?${params.toString()}`,
				);
				return data;
			},
			enabled: Boolean(installation) && debouncedOrgSearch.length > 0,
		});

	const orgRows = useMemo(
		() => orgSearchData?.rows ?? [],
		[orgSearchData?.rows],
	);

	useEffect(() => {
		if (!installation) return;
		setTargetOrgIdOrSlug(installation.target_org_id);
		setTargetEnv(installation.target_env);
	}, [installation]);

	const installMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<{ url: string }>(
				"/admin/chat/slack-admin/install",
			);
			return data;
		},
		onSuccess: ({ url }) => {
			window.location.assign(url);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to create Slack install URL"));
		},
	});

	const updateTargetMutation = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.patch<{
				installation: SlackAdminInstallation;
			}>("/admin/chat/slack-admin/target", {
				org_id: targetOrgIdOrSlug.trim(),
				env: targetEnv,
			});
			return data;
		},
		onSuccess: async () => {
			toast.success("Slack admin bot target updated");
			await queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update Slack admin bot"));
		},
	});

	const revokeMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete("/admin/chat/slack-admin");
		},
		onSuccess: async () => {
			toast.success("Slack admin bot revoked");
			setTargetOrgIdOrSlug("");
			setOrgSearch("");
			setTargetEnv(AppEnv.Live);
			await queryClient.invalidateQueries({ queryKey });
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to revoke Slack admin bot"));
		},
	});

	const handleRevoke = () => {
		if (!confirm("Revoke the Slack admin bot installation?")) return;
		revokeMutation.mutate();
	};

	const handleSelectOrg = ({ org }: { org: OrgSearchResult }) => {
		setTargetOrgIdOrSlug(org.id);
		setOrgSearch(org.name || org.slug || org.id);
	};

	return (
		<div className="max-w-3xl space-y-5">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-sm font-medium">Slack Bot</h2>
					<p className="text-xs text-muted-foreground mt-1">
						Install one admin Slack workspace and point it at a target org.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => refetch()}
					disabled={isLoading}
				>
					<RefreshCw className="size-3" />
					Refresh
				</Button>
			</div>

			<div className="border border-border rounded-lg bg-card p-4 space-y-4">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="text-sm font-medium">
								{installation?.workspace_name ?? "No workspace installed"}
							</p>
							<Badge variant={installation ? "muted" : "muted"}>
								{installation ? "Installed" : "Not installed"}
							</Badge>
						</div>
						{installation ? (
							<p className="text-xs text-muted-foreground mt-1 truncate">
								{installation.workspace_id}
								{installation.bot_user_id
									? ` - Bot ${installation.bot_user_id}`
									: ""}
							</p>
						) : null}
					</div>

					<Button
						variant="primary"
						size="sm"
						onClick={() => installMutation.mutate()}
						isLoading={installMutation.isPending}
					>
						<ExternalLink className="size-3" />
						{installation ? "Reinstall" : "Install"}
					</Button>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-2 items-start">
					<div className="space-y-1">
						<span className="text-xs text-muted-foreground">Target org</span>
						<Input
							value={targetOrgIdOrSlug}
							onChange={(event) => setTargetOrgIdOrSlug(event.target.value)}
							placeholder="Org ID or slug"
							disabled={!installation}
						/>
						<Input
							value={orgSearch}
							onChange={(event) => setOrgSearch(event.target.value)}
							placeholder="Search orgs by name, slug, or ID"
							disabled={!installation}
						/>
						{installation && debouncedOrgSearch.length > 0 ? (
							<div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-1">
								{isSearchingOrgs ? (
									<div className="px-3 py-2 text-xs text-tertiary-foreground">
										Searching organizations...
									</div>
								) : orgRows.length === 0 ? (
									<div className="px-3 py-2 text-xs text-tertiary-foreground">
										No organizations found.
									</div>
								) : (
									orgRows.map((org) => {
										const isSelected = targetOrgIdOrSlug === org.id;

										return (
											<button
												type="button"
												key={org.id}
												onClick={() => handleSelectOrg({ org })}
												className={`flex w-full flex-col rounded px-2 py-1.5 text-left transition-colors ${
													isSelected
														? "bg-primary/10 text-foreground"
														: "hover:bg-muted/50"
												}`}
											>
												<span className="truncate text-xs font-medium">
													{org.name || org.id}
												</span>
												<span className="truncate font-mono text-[11px] text-tertiary-foreground">
													{org.id}
												</span>
												{org.slug ? (
													<span className="truncate text-[11px] text-tertiary-foreground">
														{org.slug}
													</span>
												) : null}
											</button>
										);
									})
								)}
							</div>
						) : null}
					</div>

					<div className="space-y-1">
						<span className="text-xs text-muted-foreground">Environment</span>
						<Select
							value={targetEnv}
							onValueChange={(value) => setTargetEnv(value as AppEnv)}
							disabled={!installation}
						>
							<SelectTrigger className="h-input px-2">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={AppEnv.Live}>Live</SelectItem>
								<SelectItem value={AppEnv.Sandbox}>Sandbox</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<Button
						variant="secondary"
						size="sm"
						onClick={() => updateTargetMutation.mutate()}
						disabled={!installation || !targetOrgIdOrSlug.trim()}
						isLoading={updateTargetMutation.isPending}
					>
						<Save className="size-3" />
						Save
					</Button>
				</div>

				{credentials.length > 0 ? (
					<div className="rounded-md border border-border bg-background p-3">
						<p className="text-xs font-medium text-muted-foreground">
							Internal OAuth credentials
						</p>
						<div className="mt-2 space-y-1">
							{credentials.map((credential) => (
								<div
									key={credential.id}
									className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tertiary-foreground"
								>
									<span className="font-medium text-foreground">
										{credential.env}
									</span>
									<span>{credential.oauth_client_id}</span>
									{credential.oauth_consent_id ? (
										<span className="font-mono">
											{credential.oauth_consent_id}
										</span>
									) : null}
								</div>
							))}
						</div>
					</div>
				) : null}

				<div className="flex justify-end border-t border-border pt-4">
					<Button
						variant="destructive"
						size="sm"
						onClick={handleRevoke}
						disabled={!installation}
						isLoading={revokeMutation.isPending}
					>
						<Trash2 className="size-3" />
						Revoke
					</Button>
				</div>
			</div>
		</div>
	);
};
