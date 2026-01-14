import {
	Check,
	ChevronDown,
	Clock,
	ExternalLink,
	Shield,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/v2/buttons/Button";
import {
	authClient,
	useListOrganizations,
	useSession,
} from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface ScopeInfo {
	id: string;
	name: string;
	description: string;
}

interface ClientInfo {
	client_id: string;
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	policy_uri?: string;
	tos_uri?: string;
}

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

// Map scope IDs to human-readable descriptions
const SCOPE_DESCRIPTIONS: Record<
	string,
	{ name: string; description: string }
> = {
	openid: {
		name: "User ID",
		description: "Access your unique user identifier",
	},
	profile: {
		name: "Profile information",
		description: "Access your name and profile picture",
	},
	email: {
		name: "Email address",
		description: "Access your email address",
	},
	"apikeys:read": {
		name: "Read API keys",
		description: "View your API keys",
	},
	"apikeys:write": {
		name: "Manage API keys",
		description: "Create and manage your API keys",
	},
};

function getScopeInfo(scopeId: string): { name: string; description: string } {
	return (
		SCOPE_DESCRIPTIONS[scopeId] || {
			name: scopeId,
			description: `Access to ${scopeId}`,
		}
	);
}

// Org logo component (simplified version)
const OrgLogo = ({ org }: { org: { name: string; logo?: string | null } }) => {
	const firstLetter = org?.name?.charAt(0).toUpperCase() || "A";

	return (
		<div className="rounded-md overflow-hidden flex items-center justify-center bg-zinc-200 dark:bg-zinc-700 w-6 h-6 min-w-6 min-h-6">
			{org.logo ? (
				<img src={org.logo} alt={org.name} className="w-full h-full" />
			) : (
				<span className="w-6 h-6 flex items-center justify-center bg-linear-to-r from-purple-600 via-purple-500 to-purple-400 text-white text-xs font-medium">
					{firstLetter}
				</span>
			)}
		</div>
	);
};

export const Consent = () => {
	const [searchParams] = useSearchParams();
	const { data: session } = useSession();
	const { data: orgs } = useListOrganizations();
	const { data: activeOrganization } = authClient.useActiveOrganization();

	const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
	const [scopes, setScopes] = useState<ScopeInfo[]>([]);
	const [jokeScope] = useState(() => getRandomJokeScope());
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
	const [switchingOrg, setSwitchingOrg] = useState(false);
	const orgDropdownRef = useRef<HTMLDivElement>(null);

	const clientId = searchParams.get("client_id");
	const requestedScopes = searchParams.get("scope")?.split(" ") || [];

	// Get the current org (active or first available)
	const currentOrg = activeOrganization || orgs?.[0];

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				orgDropdownRef.current &&
				!orgDropdownRef.current.contains(event.target as Node)
			) {
				setOrgDropdownOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleSwitchOrg = async (orgId: string) => {
		setSwitchingOrg(true);
		try {
			await authClient.organization.setActive({
				organizationId: orgId,
			});
			// Reload to refresh the page with new org context
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

			try {
				// Fetch client name from our own endpoint
				const response = await fetch(
					`${import.meta.env.VITE_BACKEND_URL}/oauth/client/${encodeURIComponent(clientId)}`,
				);

				if (response.ok) {
					const data = await response.json();
					setClientInfo({
						client_id: clientId,
						client_name: data.name || "Unknown Application",
					});
				} else {
					console.error("Error fetching client info:", response.status);
					// Fallback - just use the client_id
					setClientInfo({
						client_id: clientId,
						client_name: "External Application",
					});
				}
			} catch (error) {
				console.error("Error fetching client info:", error);
				// Fallback - just use the client_id
				setClientInfo({
					client_id: clientId,
					client_name: "External Application",
				});
			}

			// Parse scopes
			const scopeInfos: ScopeInfo[] = requestedScopes.map((scopeId) => {
				const info = getScopeInfo(scopeId);
				return {
					id: scopeId,
					name: info.name,
					description: info.description,
				};
			});
			setScopes(scopeInfos);
			setIsLoading(false);
		}

		fetchClientInfo();
	}, [clientId, requestedScopes.join(",")]);

	const handleAuthorize = async () => {
		setIsSubmitting(true);
		try {
			const grantedScopes = scopes.map((s) => s.id).join(" ");

			const { data, error } = await authClient.oauth2.consent({
				accept: true,
				scope: grantedScopes,
			});

			if (error) {
				toast.error(error.message || "Authorization failed");
				setIsSubmitting(false);
				return;
			}

			// Handle redirect - server returns { redirect: true, uri: "..." }
			if (data?.uri) {
				window.location.href = data.uri;
			} else if (data?.redirectTo) {
				window.location.href = data.redirectTo;
			}
		} catch (error) {
			console.error("Authorization error:", error);
			toast.error("Authorization failed. Please try again.");
			setIsSubmitting(false);
		}
	};

	const handleCancel = async () => {
		setIsSubmitting(true);
		try {
			const { data, error } = await authClient.oauth2.consent({
				accept: false,
			});

			if (error) {
				toast.error(error.message || "Failed to cancel authorization");
				setIsSubmitting(false);
				return;
			}

			if (data?.uri) {
				window.location.href = data.uri;
			} else if (data?.redirectTo) {
				window.location.href = data.redirectTo;
			}
		} catch (error) {
			console.error("Cancel error:", error);
			toast.error("Failed to cancel. Please close this window.");
			setIsSubmitting(false);
		}
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
						<img src="/logo_hd.png" alt="Autumn" className="w-12 h-12" />
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
		<div className="w-screen h-screen bg-background flex items-center justify-center p-4">
			<CustomToaster />
			<div className="w-full max-w-[420px] space-y-6">
				{/* Logo */}
				<div className="flex justify-center">
					<img src="/logo_hd.png" alt="Autumn" className="w-12 h-12" />
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

				{/* Organization Selector */}
				{currentOrg && (
					<div
						ref={orgDropdownRef}
						className="border border-border rounded-xl bg-card"
					>
						<div className="px-4 py-2 border-b border-border bg-muted/30">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
								Organization
							</p>
						</div>
						<div className="relative">
							<button
								type="button"
								onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
								disabled={switchingOrg || !orgs || orgs.length < 2}
								className={cn(
									"w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
									orgs &&
										orgs.length >= 2 &&
										"hover:bg-muted/50 cursor-pointer",
									switchingOrg && "opacity-50",
								)}
							>
								<div className="flex items-center gap-3">
									<OrgLogo org={currentOrg} />
									<span className="text-sm font-medium text-foreground">
										{currentOrg.name}
									</span>
								</div>
								{orgs && orgs.length >= 2 && (
									<ChevronDown
										className={cn(
											"w-4 h-4 text-muted-foreground transition-transform",
											orgDropdownOpen && "rotate-180",
										)}
									/>
								)}
							</button>

							{/* Dropdown */}
							{orgDropdownOpen && orgs && orgs.length >= 2 && (
								<div className="absolute top-full left-0 right-0 z-50 mt-1 border border-border rounded-lg bg-card shadow-lg max-h-64 overflow-y-auto">
									{orgs
										.filter((org) => org.id !== currentOrg.id)
										.map((org) => (
											<button
												key={org.id}
												type="button"
												onClick={() => {
													setOrgDropdownOpen(false);
													handleSwitchOrg(org.id);
												}}
												className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
											>
												<OrgLogo org={org} />
												<span className="text-sm text-foreground">
													{org.name}
												</span>
											</button>
										))}
								</div>
							)}
						</div>
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

					{/* Scopes List */}
					<div className="divide-y divide-border">
						{scopes.map((scope) => (
							<div
								key={scope.id}
								className="w-full flex items-start gap-3 px-4 py-3 text-left"
							>
								<div className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-green-500/10 text-green-600">
									<Check className="w-3 h-3" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-foreground">
										{scope.name}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{scope.description}
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
							<a
								href="/customers#settings.apps"
								className="text-primary hover:underline"
							>
								organization settings
							</a>
							.
						</span>
					</div>
				</div>

				{/* Action Buttons */}
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
						onClick={handleAuthorize}
						isLoading={isSubmitting}
						className="flex-1"
					>
						Authorize
					</Button>
				</div>
			</div>
		</div>
	);
};
