import {
	AppEnv,
	type GroupedPermission,
	groupAndFormatScopes,
	isScopeSubset,
	LEAF_OAUTH_SCOPES,
} from "@autumn/shared";
import { Check, Clock, ExternalLink, Shield, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/v2/buttons/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";

interface ClientInfo {
	client_id: string;
	client_name?: string;
	is_atmn?: boolean;
	client_uri?: string;
	logo_uri?: string;
	policy_uri?: string;
	tos_uri?: string;
	is_internal_mcp?: boolean;
	default_env?: AppEnv;
}

type SessionWithScopes = {
	scopes?: string[];
};

// Joke scopes - one is randomly selected to show at the end
const JOKE_SCOPES = [
	{ name: "Increase your MRR", description: "Automatically 10x your revenue" },
	{
		name: "Steal all your Stripe keys",
		description: "For safekeeping, of course",
	},
	{ name: "Delete production database", description: "What could go wrong?" },
	{
		name: "Charge customers twice",
		description: "Double the revenue, double the fun",
	},
	{
		name: "Leak your pricing strategy",
		description: "Competitors love this one trick",
	},
	{ name: "Downgrade all paid users", description: "Free tier for everyone!" },
	{
		name: "Refund all transactions",
		description: "Your accountant will love this",
	},
	{
		name: "Email investors your burn rate",
		description: "Transparency is key",
	},
	{
		name: "Set all prices to $0.01",
		description: "Aggressive pricing strategy",
	},
	{
		name: "Auto-approve all refunds",
		description: "Customer satisfaction guaranteed",
	},
	{
		name: "Share your churn rate on Twitter",
		description: "Radical transparency",
	},
	{
		name: "Convert annual plans to monthly",
		description: "Cash flow is overrated",
	},
	{
		name: "Add hidden fees to invoices",
		description: "Airlines hate this one trick",
	},
	{
		name: "Send payment reminders at 3am",
		description: "Urgency drives conversions",
	},
];

// Get a random joke scope (seeded by session to stay consistent)
const getRandomJokeScope = () => {
	const index = Math.floor(Math.random() * JOKE_SCOPES.length);
	return JOKE_SCOPES[index];
};

// Org logo component (simplified version)
const OrgLogo = ({ org }: { org: { name: string; logo?: string | null } }) => {
	const firstLetter = org?.name?.charAt(0).toUpperCase() || "A";

	return (
		<div className="rounded-md overflow-hidden flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 w-5 h-5 min-w-5 min-h-5">
			{org.logo ? (
				<img src={org.logo} alt={org.name} className="w-full h-full" />
			) : (
				<span className="w-5 h-5 flex items-center justify-center bg-linear-to-r from-purple-600 via-purple-500 to-purple-400 text-white text-[10px] font-medium">
					{firstLetter}
				</span>
			)}
		</div>
	);
};

const getConsentRedirectUrl = (data: unknown) => {
	if (!data || typeof data !== "object") return null;
	const response = data as Record<string, unknown>;

	return [response.url, response.uri, response.redirectTo].find(
		(value): value is string => typeof value === "string" && value.length > 0,
	);
};

const parseAppEnv = (value: unknown) =>
	value === AppEnv.Sandbox || value === AppEnv.Live ? value : null;

const getOAuthQueryParam = (
	searchParams: URLSearchParams,
	key: string,
): string | null => {
	const directValue = searchParams.get(key);
	if (directValue) return directValue;

	const rawOAuthQuery = searchParams.get("oauth_query");
	if (!rawOAuthQuery) return null;

	try {
		const parsed = JSON.parse(rawOAuthQuery);
		if (parsed && typeof parsed === "object") {
			const value = (parsed as Record<string, unknown>)[key];
			return typeof value === "string" && value.length > 0 ? value : null;
		}
	} catch {
		return new URLSearchParams(rawOAuthQuery).get(key);
	}

	return null;
};

const isExternalAppRedirect = (redirectUrl: string) => {
	if (!URL.canParse(redirectUrl)) return false;
	const protocol = new URL(redirectUrl).protocol;
	return protocol !== "http:" && protocol !== "https:";
};

const openConsentRedirect = ({
	onExternalRedirectFallback,
	redirectUrl,
}: {
	onExternalRedirectFallback: () => void;
	redirectUrl: string;
}) => {
	const shouldShowFallback = isExternalAppRedirect(redirectUrl);
	window.location.href = redirectUrl;

	if (shouldShowFallback) {
		window.setTimeout(onExternalRedirectFallback, 1200);
	}
};

const leafScopeSet = new Set<string>(LEAF_OAUTH_SCOPES);

const getGrantableMcpScopes = ({
	requestedScopes,
	sessionScopes,
}: {
	requestedScopes: string[];
	sessionScopes: string[];
}) => {
	const requested =
		requestedScopes.length > 0 ? requestedScopes : [...LEAF_OAUTH_SCOPES];

	return [...new Set(requested)]
		.filter((scope) => leafScopeSet.has(scope))
		.filter((scope) => isScopeSubset([scope], sessionScopes));
};

export const Consent = () => {
	const [searchParams] = useSearchParams();
	const { data: session } = useSession();
	const { data: orgs } = useListOrganizations();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const errorIconMaskId = useId();
	const consentIconMaskId = useId();

	const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
	const [groupedPermissions, setGroupedPermissions] = useState<
		GroupedPermission[]
	>([]);
	const [jokeScope] = useState(() => getRandomJokeScope());
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [pendingRedirectUrl, setPendingRedirectUrl] = useState<string | null>(
		null,
	);
	const [switchingOrg, setSwitchingOrg] = useState(false);

	const clientId = searchParams.get("client_id");
	const redirectUri = searchParams.get("redirect_uri");
	const requestedScopes =
		searchParams.get("scope")?.split(/\s+/).filter(Boolean) || [];
	const requestedEnv = getOAuthQueryParam(searchParams, "env");
	const initialEnv = parseAppEnv(requestedEnv) ?? AppEnv.Live;
	const [selectedEnv, setSelectedEnv] = useState<AppEnv>(initialEnv);
	const sessionScopes =
		(session as SessionWithScopes | null | undefined)?.scopes ?? [];

	// Get the current org (active or first available)
	const currentOrg = activeOrganization || orgs?.[0];

	const handleSwitchOrg = async (orgId: string) => {
		setSwitchingOrg(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			window.location.reload();
		} catch (_) {
			toast.error("Failed to switch organization");
			setSwitchingOrg(false);
		}
	};

	useEffect(() => {
		async function fetchClientInfo() {
			if (!clientId) {
				toast.error("Missing client_id parameter");
				setIsLoading(false);
				return;
			}

			let isInternalMcp = false;
			try {
				// Fetch client name from our own endpoint
				const clientInfoUrl = new URL(
					`${import.meta.env.VITE_BACKEND_URL}/oauth/client/${encodeURIComponent(clientId)}`,
				);
				if (redirectUri) {
					clientInfoUrl.searchParams.set("redirect_uri", redirectUri);
				}

				const response = await fetch(clientInfoUrl.toString());

				if (response.ok) {
					const data = await response.json();
					const defaultEnv = parseAppEnv(data.default_env);
					if (defaultEnv) {
						setSelectedEnv(defaultEnv);
					}
					isInternalMcp = data.is_internal_mcp === true;
					setClientInfo({
						client_id: clientId,
						client_name: data.name || "Unknown Application",
						is_atmn: data.is_atmn === true,
						is_internal_mcp: isInternalMcp,
						default_env: defaultEnv ?? undefined,
					});
				} else {
					console.error("Error fetching client info:", response.status);
					// Fallback - just use the client_id
					setClientInfo({
						client_id: clientId,
						client_name: "External Application",
						is_atmn: false,
						is_internal_mcp: false,
					});
				}
			} catch (error) {
				console.error("Error fetching client info:", error);
				// Fallback - just use the client_id
				setClientInfo({
					client_id: clientId,
					client_name: "External Application",
					is_atmn: false,
					is_internal_mcp: false,
				});
			}

			// Parse and group scopes by resource
			const displayScopes =
				isInternalMcp === true
					? getGrantableMcpScopes({ requestedScopes, sessionScopes })
					: requestedScopes;
			const grouped = groupAndFormatScopes(displayScopes);
			setGroupedPermissions(grouped);
			setIsLoading(false);
		}

		fetchClientInfo();
	}, [
		clientId,
		redirectUri,
		requestedScopes.join(","),
		sessionScopes.join(","),
	]);

	const handleAuthorize = async () => {
		if (!clientInfo) {
			toast.error("Authorization failed");
			return;
		}

		setIsSubmitting(true);
		setPendingRedirectUrl(null);
		try {
			const grantedScopes =
				clientInfo.is_internal_mcp === true
					? getGrantableMcpScopes({ requestedScopes, sessionScopes }).join(" ")
					: requestedScopes.join(" ");

			const { data, error } = await authClient.oauth2.consent({
				accept: true,
				scope: grantedScopes,
				client_id: clientId,
				redirect_uri: redirectUri,
				env: clientInfo.is_atmn ? undefined : selectedEnv,
			} as Parameters<typeof authClient.oauth2.consent>[0] & {
				client_id: string | null;
				redirect_uri: string | null;
				env?: AppEnv;
			});

			if (error) {
				toast.error(error.message || "Authorization failed");
				setIsSubmitting(false);
				return;
			}

			const redirectUrl = getConsentRedirectUrl(data);
			if (redirectUrl) {
				if (isExternalAppRedirect(redirectUrl)) {
					setPendingRedirectUrl(redirectUrl);
				}
				openConsentRedirect({
					redirectUrl,
					onExternalRedirectFallback: () => setIsSubmitting(false),
				});
				return;
			}

			toast.error("Authorization failed");
			setIsSubmitting(false);
		} catch (error) {
			console.error("Authorization error:", error);
			toast.error("Authorization failed. Please try again.");
			setIsSubmitting(false);
		}
	};

	const handleCancel = async () => {
		setIsSubmitting(true);
		setPendingRedirectUrl(null);
		try {
			const { data, error } = await authClient.oauth2.consent({
				accept: false,
			});

			if (error) {
				toast.error(error.message || "Failed to cancel authorization");
				setIsSubmitting(false);
				return;
			}

			const redirectUrl = getConsentRedirectUrl(data);
			if (redirectUrl) {
				if (isExternalAppRedirect(redirectUrl)) {
					setPendingRedirectUrl(redirectUrl);
				}
				openConsentRedirect({
					redirectUrl,
					onExternalRedirectFallback: () => setIsSubmitting(false),
				});
				return;
			}

			toast.error("Failed to cancel. Please close this window.");
			setIsSubmitting(false);
		} catch (error) {
			console.error("Cancel error:", error);
			toast.error("Failed to cancel. Please close this window.");
			setIsSubmitting(false);
		}
	};

	const handleOpenPendingRedirect = () => {
		if (!pendingRedirectUrl) return;
		window.location.href = pendingRedirectUrl;
	};

	if (isLoading) {
		return (
			<div className="w-screen h-screen bg-background flex items-center justify-center">
				<div className="animate-pulse flex flex-col items-center gap-4">
					<div className="w-12 h-12 bg-muted rounded-full" />
					<div className="h-4 w-32 bg-muted rounded" />
				</div>
			</div>
		);
	}

	if (!clientInfo) {
		return (
			<div className="w-screen h-screen bg-background flex items-center justify-center p-4">
				<CustomToaster />
				<div className="text-center space-y-4">
					<div className="flex justify-center">
						<svg
							width="48"
							height="48"
							viewBox="0 0 28 28"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							aria-hidden="true"
						>
							<mask id={errorIconMaskId}>
								<rect width="28" height="28" fill="white" />
								<path
									d="M10.7139 9.06887C9.77726 11.211 8.84052 13.3532 7.90386 15.4953C8.63795 16.4465 9.37205 17.3984 10.1061 18.3496C12.2827 15.537 14.4599 12.7244 16.637 9.91183L9.27077 22.9514C12.9161 20.7518 16.5615 18.5529 20.2069 16.3534V4.85034L10.7139 9.06887Z"
									fill="black"
								/>
							</mask>
							<rect
								width="28"
								height="28"
								fill="currentColor"
								mask={`url(#${errorIconMaskId})`}
							/>
						</svg>
					</div>
					<h1 className="text-lg font-semibold text-foreground">
						Invalid Request
					</h1>
					<p className="text-sm text-muted-foreground">
						The application could not be found or the request is invalid.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-screen min-h-screen bg-background flex items-center justify-center py-8 px-4">
			<CustomToaster />
			<div className="w-full max-w-[420px] space-y-6 max-h-full overflow-y-auto">
				{/* Logo */}
				<div className="flex justify-center">
					<svg
						width="48"
						height="48"
						viewBox="0 0 28 28"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						aria-hidden="true"
					>
						<mask id={consentIconMaskId}>
							<rect width="28" height="28" fill="white" />
							<path
								d="M10.7139 9.06887C9.77726 11.211 8.84052 13.3532 7.90386 15.4953C8.63795 16.4465 9.37205 17.3984 10.1061 18.3496C12.2827 15.537 14.4599 12.7244 16.637 9.91183L9.27077 22.9514C12.9161 20.7518 16.5615 18.5529 20.2069 16.3534V4.85034L10.7139 9.06887Z"
								fill="black"
							/>
						</mask>
						<rect
							width="28"
							height="28"
							fill="currentColor"
							mask={`url(#${consentIconMaskId})`}
						/>
					</svg>
				</div>

				{/* Header */}
				<div className="text-center space-y-2">
					<h1 className="text-lg font-semibold text-foreground">
						{clientInfo.client_name}
					</h1>
					<p className="text-sm text-muted-foreground">
						wants to access your Autumn account
					</p>
					{session?.user && (
						<p className="text-xs text-muted-foreground">
							Signed in as{" "}
							<span className="font-medium text-foreground">
								{session.user.email}
							</span>
						</p>
					)}
				</div>

				{/* Account context: organization + environment */}
				{(currentOrg || !clientInfo.is_atmn) && (
					<div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
						{currentOrg && (
							<div className="flex items-center justify-between gap-3 px-4 py-3">
								<span className="text-sm text-muted-foreground shrink-0">
									Organization
								</span>
								<Select
									value={currentOrg.id}
									onValueChange={handleSwitchOrg}
									disabled={switchingOrg || !orgs || orgs.length < 2}
								>
									<SelectTrigger className="w-[200px]">
										<SelectValue>
											<span className="flex items-center gap-2 min-w-0">
												<OrgLogo org={currentOrg} />
												<span className="truncate">{currentOrg.name}</span>
											</span>
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{orgs?.map((org) => (
											<SelectItem key={org.id} value={org.id}>
												<OrgLogo org={org} />
												<span className="truncate">{org.name}</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{!clientInfo.is_atmn && (
							<div className="flex items-center justify-between gap-3 px-4 py-3">
								<span className="text-sm text-muted-foreground shrink-0">
									Environment
								</span>
								<Select
									value={selectedEnv}
									onValueChange={(value) => setSelectedEnv(value as AppEnv)}
									items={{
										[AppEnv.Sandbox]: "Sandbox",
										[AppEnv.Live]: "Production",
									}}
								>
									<SelectTrigger className="w-[200px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={AppEnv.Sandbox}>Sandbox</SelectItem>
										<SelectItem value={AppEnv.Live}>Production</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				)}

				{/* Permissions Card */}
				<div className="border border-border rounded-xl bg-card overflow-hidden">
					{/* Header */}
					<div className="px-4 py-3 border-b border-border bg-muted/30">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							This will allow {clientInfo.client_name} to:
						</p>
					</div>

					{/* Grouped Permissions List */}
					<div className="divide-y divide-border">
						{groupedPermissions.map((permission) => (
							<div
								key={permission.resource}
								className="w-full flex items-start gap-3 px-4 py-3 text-left"
							>
								<div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-green-500/10 text-green-600">
									<Check className="w-3 h-3" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-foreground">
										{permission.formattedPermission}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{permission.description}
									</p>
								</div>
							</div>
						))}
						{/* Joke scope - always denied */}
						<div className="w-full flex items-start gap-3 px-4 py-3 text-left cursor-default">
							<div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-red-500/10 text-red-500">
								<X className="w-3 h-3" />
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm font-medium text-muted-foreground">
									{jokeScope.name}
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									{jokeScope.description}
								</p>
							</div>
						</div>
					</div>
				</div>

				{/* Info Section */}
				<div className="space-y-2 text-xs text-muted-foreground">
					{clientInfo.client_uri && (
						<div className="flex items-center gap-2">
							<ExternalLink className="w-3 h-3" />
							<span>
								Once you authorize, you will be redirected to{" "}
								<span className="text-foreground font-medium">
									{new URL(clientInfo.client_uri).hostname}
								</span>
							</span>
						</div>
					)}

					{(clientInfo.policy_uri || clientInfo.tos_uri) && (
						<div className="flex items-center gap-2">
							<Shield className="w-3 h-3" />
							<span>
								{clientInfo.client_name}'s{" "}
								{clientInfo.policy_uri && (
									<a
										href={clientInfo.policy_uri}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										privacy policy
									</a>
								)}
								{clientInfo.policy_uri && clientInfo.tos_uri && " and "}
								{clientInfo.tos_uri && (
									<a
										href={clientInfo.tos_uri}
										target="_blank"
										rel="noopener noreferrer"
										className="text-primary hover:underline"
									>
										terms of service
									</a>
								)}
								{" apply to this application."}
							</span>
						</div>
					)}

					<div className="flex items-center gap-2">
						<Clock className="w-3 h-3" />
						<span>
							You can revoke access at any time from your{" "}
							<a href="/settings" className="text-primary hover:underline">
								organization settings
							</a>
							.
						</span>
					</div>
				</div>

				{/* Action Buttons */}
				{pendingRedirectUrl && !isSubmitting && (
					<p className="text-xs text-muted-foreground text-center">
						If {clientInfo.client_name} did not open, use the button below.
					</p>
				)}
				<div className="flex gap-3">
					<Button
						variant="secondary"
						onClick={handleCancel}
						disabled={isSubmitting}
						className="flex-1"
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={
							pendingRedirectUrl ? handleOpenPendingRedirect : handleAuthorize
						}
						isLoading={isSubmitting}
						className="flex-1"
					>
						{pendingRedirectUrl
							? `Open ${clientInfo.client_name}`
							: "Authorize"}
					</Button>
				</div>
			</div>
		</div>
	);
};
