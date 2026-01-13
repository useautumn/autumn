import { Check, Clock, ExternalLink, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { CustomToaster } from "@/components/general/CustomToaster";
import { Button } from "@/components/v2/buttons/Button";
import { authClient, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface ScopeInfo {
	id: string;
	name: string;
	description: string;
	granted: boolean;
}

interface ClientInfo {
	client_id: string;
	client_name?: string;
	client_uri?: string;
	logo_uri?: string;
	policy_uri?: string;
	tos_uri?: string;
}

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

export const Consent = () => {
	const [searchParams] = useSearchParams();
	const { data: session } = useSession();

	const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
	const [scopes, setScopes] = useState<ScopeInfo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const clientId = searchParams.get("client_id");
	const requestedScopes = searchParams.get("scope")?.split(" ") || [];

	useEffect(() => {
		async function fetchClientInfo() {
			if (!clientId) {
				toast.error("Missing client_id parameter");
				setIsLoading(false);
				return;
			}

			try {
				// Fetch public client info
				const { data, error } = await authClient.oauth2.publicClient({
					client_id: clientId,
				});

				if (error) {
					toast.error(error.message || "Failed to load application info");
					setIsLoading(false);
					return;
				}

				if (data) {
					setClientInfo({
						client_id: clientId,
						client_name: data.name || "Unknown Application",
						client_uri: data.uri,
						logo_uri: data.icon,
						policy_uri: data.policy,
						tos_uri: data.tos,
					});
				}

				// Parse scopes
				const scopeInfos: ScopeInfo[] = requestedScopes.map((scopeId) => {
					const info = getScopeInfo(scopeId);
					return {
						id: scopeId,
						name: info.name,
						description: info.description,
						granted: true, // All requested scopes are granted by default
					};
				});
				setScopes(scopeInfos);
			} catch (error) {
				console.error("Error fetching client info:", error);
				toast.error("Failed to load application information");
			} finally {
				setIsLoading(false);
			}
		}

		fetchClientInfo();
	}, [clientId, requestedScopes.join(",")]);

	const handleAuthorize = async () => {
		setIsSubmitting(true);
		try {
			const grantedScopes = scopes
				.filter((s) => s.granted)
				.map((s) => s.id)
				.join(" ");

			const { data, error } = await authClient.oauth2.consent({
				accept: true,
				scope: grantedScopes,
			});

			if (error) {
				toast.error(error.message || "Authorization failed");
				setIsSubmitting(false);
				return;
			}

			// The server will redirect automatically
			if (data?.redirectTo) {
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

			if (data?.redirectTo) {
				window.location.href = data.redirectTo;
			}
		} catch (error) {
			console.error("Cancel error:", error);
			toast.error("Failed to cancel. Please close this window.");
			setIsSubmitting(false);
		}
	};

	const toggleScope = (scopeId: string) => {
		// Don't allow toggling openid scope - it's required
		if (scopeId === "openid") return;

		setScopes((prev) =>
			prev.map((s) => (s.id === scopeId ? { ...s, granted: !s.granted } : s)),
		);
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
					<p className="text-sm text-muted-foreground">
						An external application
					</p>
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
							<button
								key={scope.id}
								type="button"
								onClick={() => toggleScope(scope.id)}
								disabled={scope.id === "openid"}
								className={cn(
									"w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
									scope.id !== "openid" && "hover:bg-muted/50 cursor-pointer",
									scope.id === "openid" && "cursor-default",
								)}
							>
								<div
									className={cn(
										"mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
										scope.granted
											? "bg-green-500/10 text-green-600"
											: "bg-red-500/10 text-red-500",
									)}
								>
									{scope.granted ? (
										<Check className="w-3 h-3" />
									) : (
										<X className="w-3 h-3" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<p
										className={cn(
											"text-sm font-medium",
											scope.granted
												? "text-foreground"
												: "text-muted-foreground line-through",
										)}
									>
										{scope.name}
									</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										{scope.description}
									</p>
								</div>
							</button>
						))}
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
							You can revoke access at any time from your account settings.
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
