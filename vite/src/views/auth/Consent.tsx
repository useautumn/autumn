import {
	AppEnv,
	getOAuthProtocolScopes,
	getOAuthResourcesForScopes,
	getSelectableOAuthResourceScopes,
	isScopeSubset,
	type ScopeString,
} from "@autumn/shared";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock, ExternalLink, Shield } from "lucide-react";
import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { ScopeSelector } from "@/components/v2/scope-selector";
import { useSandboxesQuery } from "@/hooks/queries/useSandboxesQuery";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { setActiveOrg } from "@/lib/orgSync";
import { getBackendErr } from "@/utils/genUtils";
import {
	type AdminMode,
	AdminModeTabs,
} from "@/views/admin/components/AdminModeTabs";
import { ImpersonateOrgSelect } from "@/views/admin/components/ImpersonateOrgSelect";
import { useAdmin } from "@/views/admin/hooks/useAdmin";

interface ClientInfo {
	client_id: string;
	client_name?: string;
	is_atmn?: boolean;
	client_uri?: string;
	logo_uri?: string;
	policy_uri?: string;
	tos_uri?: string;
	default_env?: AppEnv;
}

type SessionWithScopes = {
	scopes?: string[];
};

const OrgLogo = () => (
	<img
		src="/autumn-logo.svg"
		alt="Autumn"
		className="w-5 h-5 min-w-5 rounded-md"
	/>
);

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

const fetchOAuthClientInfo = async ({
	clientId,
	redirectUri,
}: {
	clientId: string;
	redirectUri: string | null;
}): Promise<ClientInfo> => {
	try {
		const clientInfoUrl = new URL(
			`${import.meta.env.VITE_BACKEND_URL}/oauth/client/${encodeURIComponent(clientId)}`,
		);
		if (redirectUri)
			clientInfoUrl.searchParams.set("redirect_uri", redirectUri);

		const response = await fetch(clientInfoUrl.toString());
		if (!response.ok) {
			return {
				client_id: clientId,
				client_name: "External Application",
				is_atmn: false,
			};
		}

		const data = await response.json();
		const defaultEnv = parseAppEnv(data.default_env);
		return {
			client_id: clientId,
			client_name: data.name || "Unknown Application",
			is_atmn: data.is_atmn === true,
			default_env: defaultEnv ?? undefined,
		};
	} catch (error) {
		console.error("Error fetching client info:", error);
		return {
			client_id: clientId,
			client_name: "External Application",
			is_atmn: false,
		};
	}
};

const splitScopeString = (value: string | null) =>
	value?.split(/\s+/).filter(Boolean) ?? [];

type ImpersonationCliTokens = {
	sandbox_token: string;
	live_token: string;
	expires_at: string;
};

const fetchImpersonationCliTokens =
	async (): Promise<ImpersonationCliTokens> => {
		const response = await fetch(
			`${import.meta.env.VITE_BACKEND_URL}/admin/impersonation/cli-tokens`,
			{ method: "POST", credentials: "include" },
		);
		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.message || "Failed to issue impersonation tokens");
		}
		return response.json();
	};

/** The CLI's loopback callback reads these instead of an authorization code. */
const buildImpersonationRedirect = ({
	redirectUri,
	state,
	tokens,
}: {
	redirectUri: string;
	state: string | null;
	tokens: ImpersonationCliTokens;
}) => {
	const url = new URL(redirectUri);
	if (state) url.searchParams.set("state", state);
	url.searchParams.set("impersonation_sandbox_token", tokens.sandbox_token);
	url.searchParams.set("impersonation_live_token", tokens.live_token);
	url.searchParams.set("impersonation_expires_at", tokens.expires_at);
	return url.toString();
};

const getGrantableOAuthScopes = ({
	requestedScopes,
	sessionScopes,
}: {
	requestedScopes: string[];
	sessionScopes: string[];
}) => {
	const selectableScopes = getSelectableOAuthResourceScopes(requestedScopes);
	return selectableScopes.filter((scope) =>
		isScopeSubset([scope], sessionScopes),
	);
};

export const Consent = () => {
	const [searchParams] = useSearchParams();
	const { data: session } = useSession();
	const { data: orgs } = useListOrganizations();
	const { data: activeOrganization, isPending: activeOrgPending } =
		authClient.useActiveOrganization();
	const { isAdmin, isCurrentlyImpersonating } = useAdmin();
	const errorIconMaskId = useId();
	const consentIconMaskId = useId();

	const [isSubmitting, setIsSubmitting] = useState(false);
	// Staff default to Impersonate; Regular shows the page exactly as a customer sees it.
	const [adminMode, setAdminMode] = useState<AdminMode>("impersonate");
	const [pendingRedirectUrl, setPendingRedirectUrl] = useState<string | null>(
		null,
	);
	const [switchingOrg, setSwitchingOrg] = useState(false);
	const [scopeOverride, setScopeOverride] = useState<ScopeString[] | null>(
		null,
	);
	const [environmentOverride, setEnvironmentOverride] = useState<string | null>(
		null,
	);

	const clientId = searchParams.get("client_id");
	const redirectUri = searchParams.get("redirect_uri");
	const requestedScopes = splitScopeString(
		getOAuthQueryParam(searchParams, "scope"),
	);
	const requestedEnv = getOAuthQueryParam(searchParams, "env");
	const requestedState = getOAuthQueryParam(searchParams, "state");
	const initialEnv = parseAppEnv(requestedEnv) ?? AppEnv.Live;
	const sessionScopes =
		(session as SessionWithScopes | null | undefined)?.scopes ?? [];
	const clientInfoQuery = useQuery({
		queryKey: ["oauth-client-info", clientId, redirectUri],
		queryFn: () =>
			fetchOAuthClientInfo({ clientId: clientId ?? "", redirectUri }),
		enabled: !!clientId,
	});
	const clientInfo = clientInfoQuery.data ?? null;
	// Falling back to the first membership while the active org is still loading
	// flashes the wrong name; wait for the session's answer first.
	const currentOrg =
		activeOrganization ?? (activeOrgPending ? undefined : orgs?.[0]);
	const { sandboxes } = useSandboxesQuery({
		enabled: !!currentOrg && clientInfo?.is_atmn === false,
	});
	const defaultScopes = getGrantableOAuthScopes({
		requestedScopes,
		sessionScopes,
	});
	const selectableResources = getOAuthResourcesForScopes(
		getSelectableOAuthResourceScopes(requestedScopes),
	);
	const selectedScopes = scopeOverride ?? defaultScopes;
	const selectedEnvironment =
		environmentOverride ?? clientInfo?.default_env ?? initialEnv;
	const selectedEnv =
		selectedEnvironment === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
	const selectedSandboxOrgId =
		selectedEnvironment === AppEnv.Live ||
		selectedEnvironment === AppEnv.Sandbox
			? undefined
			: selectedEnvironment;
	const isLoading = !!clientId && clientInfoQuery.isLoading;
	const canAuthorize = selectedScopes.length > 0;
	// atmn must not mint permanent api keys for an impersonated customer.
	const isAtmnImpersonation =
		clientInfo?.is_atmn === true && isCurrentlyImpersonating;
	const showImpersonatePicker = isAdmin && adminMode === "impersonate";

	const handleSwitchOrg = async (orgId: string) => {
		setSwitchingOrg(true);
		try {
			await setActiveOrg(orgId);
			window.location.reload();
		} catch (_) {
			toast.error("Failed to switch organization");
			setSwitchingOrg(false);
		}
	};

	const submitConsent = async ({
		env,
		sandboxOrgId,
		scope,
	}: {
		env?: AppEnv;
		sandboxOrgId?: string;
		scope: string[];
	}) => {
		setIsSubmitting(true);
		setPendingRedirectUrl(null);
		try {
			const { data, error } = await authClient.oauth2.consent({
				accept: true,
				scope: scope.join(" "),
				client_id: clientId,
				redirect_uri: redirectUri,
				env,
				sandbox_org_id: sandboxOrgId,
			} as Parameters<typeof authClient.oauth2.consent>[0] & {
				client_id: string | null;
				redirect_uri: string | null;
				env?: AppEnv;
				sandbox_org_id?: string;
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

	const handleAuthorize = async () => {
		if (!clientInfo) {
			toast.error("Authorization failed");
			return;
		}
		if (isAtmnImpersonation) {
			if (!redirectUri) {
				toast.error("Missing redirect_uri");
				return;
			}
			setIsSubmitting(true);
			try {
				const tokens = await fetchImpersonationCliTokens();
				window.location.href = buildImpersonationRedirect({
					redirectUri,
					state: requestedState,
					tokens,
				});
			} catch (error) {
				toast.error(
					getBackendErr(error, "Failed to issue impersonation tokens"),
				);
				setIsSubmitting(false);
			}
			return;
		}
		if (selectedScopes.length === 0) {
			toast.error("Select at least one Autumn permission");
			return;
		}

		// Echo the app's originally-requested protocol scopes (openid,
		// offline_access, …) so narrowing keeps the consent set a subset of
		// the /authorize request — better-auth rejects anything it didn't see.
		const consentScopes = clientInfo.is_atmn
			? requestedScopes
			: [
					...new Set([
						...selectedScopes,
						...getOAuthProtocolScopes(requestedScopes),
					]),
				];
		await submitConsent({
			scope: consentScopes,
			env: clientInfo.is_atmn ? undefined : selectedEnv,
			sandboxOrgId: clientInfo.is_atmn ? undefined : selectedSandboxOrgId,
		});
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

				{isAdmin && (
					<AdminModeTabs mode={adminMode} onModeChange={setAdminMode} />
				)}

				{/* Account context: organization + environment */}
				{(currentOrg || showImpersonatePicker || !clientInfo.is_atmn) && (
					<div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
						{currentOrg && !showImpersonatePicker && (
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
												<OrgLogo />
												<span className="truncate">{currentOrg.name}</span>
											</span>
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{orgs?.map((org) => (
											<SelectItem key={org.id} value={org.id}>
												<OrgLogo />
												<span className="truncate">{org.name}</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{/* Staff pick any customer org here; the reload lands back on this consent URL. */}
						{showImpersonatePicker && (
							<div className="flex items-center justify-between gap-3 px-4 py-3">
								<span className="text-sm text-muted-foreground shrink-0">
									Impersonate
								</span>
								<ImpersonateOrgSelect currentOrg={currentOrg ?? undefined} />
							</div>
						)}

						{!clientInfo.is_atmn && (
							<div className="flex items-center justify-between gap-3 px-4 py-3">
								<span className="text-sm text-muted-foreground shrink-0">
									Environment
								</span>
								<Select
									value={selectedEnvironment}
									onValueChange={setEnvironmentOverride}
								>
									<SelectTrigger className="w-[200px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={AppEnv.Sandbox}>Sandbox</SelectItem>
										<SelectItem value={AppEnv.Live}>Production</SelectItem>
										{sandboxes.map((sandbox) => (
											<SelectItem key={sandbox.id} value={sandbox.id}>
												{sandbox.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
				)}

				<div className="border border-border rounded-xl bg-card overflow-hidden">
					<div className="px-4 py-3 border-b border-border bg-muted/30">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{isAtmnImpersonation
								? "Support access for"
								: clientInfo.is_atmn
									? "Permissions for"
									: "Choose permissions for"}{" "}
							{clientInfo.client_name}
						</p>
					</div>
					<div className="px-4 py-3">
						{isAtmnImpersonation ? (
							<p className="text-sm text-muted-foreground">
								You are impersonating{" "}
								<span className="font-medium text-foreground">
									{currentOrg?.name ?? "this organization"}
								</span>
								. Authorizing issues one-hour sandbox and production tokens to{" "}
								{clientInfo.client_name} instead of API keys. Nothing is added
								to the customer's API keys or authorized apps.
							</p>
						) : (
							<ScopeSelector
								value={selectedScopes}
								onChange={setScopeOverride}
								availableScopes={sessionScopes}
								resources={selectableResources}
								allowUnrestricted={false}
								disabled={isSubmitting || clientInfo.is_atmn}
								showPresets={!clientInfo.is_atmn}
								defaultScopes={defaultScopes}
							/>
						)}
						{!canAuthorize && !isAtmnImpersonation && (
							<p className="text-xs text-destructive mt-3">
								Select at least one permission to authorize this app.
							</p>
						)}
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
						disabled={
							isSubmitting ||
							(!pendingRedirectUrl && !canAuthorize && !isAtmnImpersonation)
						}
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
