import { Calendar, Key, Shield, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { getBackendErr } from "@/utils/genUtils";

interface OAuthConsent {
	id: string;
	clientId: string;
	scopes: string[];
	referenceId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface ClientInfo {
	client_id: string;
	name: string;
}

interface ApiKeyPreview {
	prefix: string;
	name: string;
	env: string;
}

// Map scope IDs to human-readable names
const SCOPE_NAMES: Record<string, string> = {
	openid: "User ID",
	profile: "Profile",
	email: "Email",
	offline_access: "Offline Access",
	"apikeys:read": "Read API Keys",
	"apikeys:write": "Manage API Keys",
};

function getScopeName(scope: string): string {
	return SCOPE_NAMES[scope] || scope;
}

export const AuthorizedApps = () => {
	const [consents, setConsents] = useState<OAuthConsent[]>([]);
	const [clientNames, setClientNames] = useState<Record<string, string>>({});
	const [isLoading, setIsLoading] = useState(true);
	const [revokingId, setRevokingId] = useState<string | null>(null);

	// Revoke confirmation dialog state
	const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
	const [revokeTarget, setRevokeTarget] = useState<{
		consentId: string;
		clientName: string;
	} | null>(null);
	const [linkedApiKeys, setLinkedApiKeys] = useState<ApiKeyPreview[]>([]);
	const [loadingApiKeys, setLoadingApiKeys] = useState(false);

	const fetchConsents = async () => {
		setIsLoading(true);
		try {
			// Use our new org-level consent endpoint
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/consents`,
				{
					credentials: "include",
				},
			);

			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				toast.error(error.message || "Failed to fetch authorized apps");
				return;
			}

			const data = await response.json();
			const consentList = (data.consents as OAuthConsent[]) || [];
			setConsents(consentList);

			// Fetch client names for each consent
			const names: Record<string, string> = {};
			await Promise.all(
				consentList.map(async (consent) => {
					try {
						const clientResponse = await fetch(
							`${import.meta.env.VITE_BACKEND_URL}/oauth/client/${encodeURIComponent(consent.clientId)}`,
						);
						if (clientResponse.ok) {
							const clientData: ClientInfo = await clientResponse.json();
							names[consent.clientId] = clientData.name;
						} else {
							names[consent.clientId] = "Unknown Application";
						}
					} catch {
						names[consent.clientId] = "Unknown Application";
					}
				}),
			);
			setClientNames(names);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to fetch authorized apps"));
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchConsents();
	}, []);

	const handleRevokeClick = async (consentId: string, clientName: string) => {
		setRevokeTarget({ consentId, clientName });
		setRevokeDialogOpen(true);
		setLoadingApiKeys(true);
		setLinkedApiKeys([]);

		// Fetch API keys linked to this consent
		try {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/consents/${consentId}/api-keys`,
				{
					credentials: "include",
				},
			);

			if (response.ok) {
				const data = await response.json();
				setLinkedApiKeys(data.apiKeys || []);
			}
		} catch {
			// If we can't fetch API keys, just show the basic dialog
		} finally {
			setLoadingApiKeys(false);
		}
	};

	const handleConfirmRevoke = async () => {
		if (!revokeTarget) return;

		setRevokingId(revokeTarget.consentId);
		try {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/consents/${revokeTarget.consentId}`,
				{
					method: "DELETE",
					credentials: "include",
				},
			);

			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				toast.error(error.message || "Failed to revoke access");
				return;
			}

			const result = await response.json();
			toast.success(
				`Access revoked for ${revokeTarget.clientName}${result.deletedApiKeys > 0 ? ` (${result.deletedApiKeys} API key${result.deletedApiKeys > 1 ? "s" : ""} deleted)` : ""}`,
			);
			fetchConsents();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to revoke access"));
		} finally {
			setRevokingId(null);
			setRevokeDialogOpen(false);
			setRevokeTarget(null);
			setLinkedApiKeys([]);
		}
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="flex flex-col px-6 py-4">
			<div className="border border-border rounded-xl bg-card overflow-hidden">
				<div className="px-4 py-3 border-b border-border bg-muted/30">
					<div className="flex items-center gap-2">
						<Shield className="w-4 h-4 text-t3" />
						<h2 className="text-sm font-medium text-t1">
							Authorized Applications
						</h2>
					</div>
					<p className="text-xs text-t3 mt-1">
						These applications have access to this organization
					</p>
				</div>

				<div className="divide-y divide-border">
					{isLoading ? (
						<div className="px-4 py-12 text-center text-sm text-t3">
							<span className="shimmer">Loading authorized apps...</span>
						</div>
					) : consents.length === 0 ? (
						<div className="px-4 py-12 text-center">
							<Shield className="w-8 h-8 mx-auto mb-3 text-t4" />
							<p className="text-sm text-t3">
								No applications have been authorized
							</p>
							<p className="text-xs text-t4 mt-1">
								When you authorize an app to access this organization, it will
								appear here
							</p>
						</div>
					) : (
						consents.map((consent) => (
							<div
								key={consent.id}
								className="px-4 py-4 flex items-start justify-between gap-4"
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<p className="text-sm font-medium text-t1">
											{clientNames[consent.clientId] || "Loading..."}
										</p>
									</div>

									{/* Scopes */}
									<div className="flex flex-wrap gap-1 mt-2">
										{consent.scopes.map((scope) => (
											<Badge
												key={scope}
												variant="muted"
												className="text-xs"
											>
												{getScopeName(scope)}
											</Badge>
										))}
									</div>

									{/* Date */}
									<div className="flex items-center gap-1 mt-2 text-xs text-t3">
										<Calendar className="w-3 h-3" />
										<span>Authorized on {formatDate(consent.createdAt)}</span>
									</div>
								</div>

								{/* Revoke Button */}
								<Button
									variant="secondary"
									size="sm"
									onClick={() =>
										handleRevokeClick(
											consent.id,
											clientNames[consent.clientId] || "this app",
										)
									}
									disabled={revokingId === consent.id}
									className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
								>
									<Trash2 className="w-3.5 h-3.5 mr-1.5" />
									{revokingId === consent.id ? "Revoking..." : "Revoke"}
								</Button>
							</div>
						))
					)}
				</div>
			</div>

			{/* Revoke Confirmation Dialog */}
			<Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke Access</DialogTitle>
						<DialogDescription>
							Are you sure you want to revoke access for{" "}
							<span className="font-semibold text-t1">
								{revokeTarget?.clientName}
							</span>
							? This app will no longer be able to access your organization.
						</DialogDescription>
					</DialogHeader>

					{/* Show linked API keys that will be deleted */}
					{loadingApiKeys ? (
						<div className="py-3 text-sm text-t3">
							Checking for linked API keys...
						</div>
					) : linkedApiKeys.length > 0 ? (
						<div className="py-2">
							<div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
								<Key className="w-4 h-4" />
								<span>The following API keys will also be deleted:</span>
							</div>
							<div className="space-y-1.5 bg-input/50 dark:bg-input/30 rounded-md p-3">
								{linkedApiKeys.map((key, index) => (
									<div
										key={index}
										className="flex items-center justify-between text-sm"
									>
										<code className="font-mono text-xs text-t2 bg-background px-2 py-0.5 rounded">
											{key.prefix}...
										</code>
										<div className="flex items-center gap-2">
											<span className="text-t3 text-xs">{key.name}</span>
											<span
												className={`text-xs px-1.5 py-0.5 rounded ${
													key.env === "live"
														? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
														: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
												}`}
											>
												{key.env}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}

					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setRevokeDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleConfirmRevoke}
							isLoading={revokingId !== null}
						>
							Revoke Access
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
