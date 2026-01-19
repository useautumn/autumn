import { ArrowLeft, Globe, Key, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";
import { CreateOAuthClientDialog } from "./CreateOAuthClientDialog";

interface OAuthClient {
	id?: string;
	client_id: string;
	client_name?: string;
	redirect_uris: string[];
	public?: boolean;
	disabled?: boolean;
	skip_consent?: boolean;
	scope?: string;
	client_id_issued_at?: number;
	token_endpoint_auth_method?: string;
	grant_types?: string[];
	response_types?: string[];
	reference_id?: string;
}

export const OAuthClientsView = () => {
	const navigate = useNavigate();
	const { isAdmin, isPending } = useAdmin();
	const [clients, setClients] = useState<OAuthClient[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const fetchClients = async () => {
		setIsLoading(true);
		try {
			const { data, error } = await authClient.oauth2.getClients();
			if (error) {
				toast.error(error.message || "Failed to fetch OAuth clients");
				return;
			}
			console.log("OAuth Clients Data:", data);
			setClients((data as OAuthClient[]) || []);
		} catch (error) {
			console.error("Fetch clients error:", error);
			toast.error(getBackendErr(error, "Failed to fetch OAuth clients"));
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (isAdmin) {
			fetchClients();
		}
	}, [isAdmin]);

	const handleDeleteClient = async (client_id: string) => {
		if (!confirm("Are you sure you want to delete this OAuth client?")) {
			return;
		}

		try {
			const { error } = await authClient.oauth2.deleteClient({
				client_id,
			});
			if (error) {
				toast.error(error.message || "Failed to delete client");
				return;
			}
			toast.success("OAuth client deleted");
			fetchClients();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete client"));
		}
	};

	const handleRotateSecret = async (client_id: string) => {
		if (
			!confirm(
				"Are you sure? This will invalidate the current client secret immediately.",
			)
		) {
			return;
		}

		try {
			const { data, error } = await authClient.oauth2.client.rotateSecret({
				client_id,
			});
			if (error) {
				toast.error(error.message || "Failed to rotate secret");
				return;
			}
			toast.success("Client secret rotated");
			// Show the new secret in a toast since it can only be viewed once
			if (data?.client_secret) {
				toast.info(`New secret: ${data.client_secret}`, {
					duration: 30000,
					description: "Copy this now - it won't be shown again!",
				});
			}
			fetchClients();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to rotate secret"));
		}
	};

	if (isPending) {
		return (
			<div className="h-screen w-screen">
				<LoadingScreen />
			</div>
		);
	}

	if (!isAdmin) {
		return <DefaultView />;
	}

	return (
		<div className="flex flex-col p-6 max-w-6xl mx-auto">
			{/* Header */}
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-3">
					<IconButton
						variant="secondary"
						size="sm"
						icon={<ArrowLeft className="w-4 h-4" />}
						onClick={() => navigate("/admin")}
					/>
					<div>
						<h1 className="text-lg font-semibold text-foreground">
							OAuth Clients
						</h1>
						<p className="text-sm text-muted-foreground">
							Manage OAuth 2.1 clients for external applications
						</p>
					</div>
				</div>
				<div className="flex gap-2">
					<IconButton
						variant="secondary"
						size="sm"
						icon={<RefreshCw className="w-4 h-4" />}
						onClick={fetchClients}
						disabled={isLoading}
					>
						Refresh
					</IconButton>
					<IconButton
						variant="primary"
						size="sm"
						icon={<Plus className="w-4 h-4" />}
						onClick={() => setCreateDialogOpen(true)}
					>
						Create Client
					</IconButton>
				</div>
			</div>

			{/* Clients Table */}
			<div className="border border-border rounded-xl bg-card overflow-hidden">
				{/* Table Header */}
				<div className="grid grid-cols-[1fr_120px_120px_1fr_100px] gap-4 px-4 py-3 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wide">
					<div>Client</div>
					<div>Type</div>
					<div>Status</div>
					<div>Redirect URIs</div>
					<div className="text-right">Actions</div>
				</div>

				{/* Table Body */}
				<div className="divide-y divide-border">
					{isLoading ? (
						<div className="px-4 py-12 text-center text-sm text-muted-foreground">
							<span className="shimmer">Loading clients...</span>
						</div>
					) : clients.length === 0 ? (
						<div className="px-4 py-12 text-center">
							<Globe className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
							<p className="text-sm text-muted-foreground">No OAuth clients yet</p>
							<p className="text-xs text-muted-foreground mt-1">
								Create your first client to get started
							</p>
						</div>
					) : (
						clients.map((client) => (
							<div
								key={client.client_id}
								className="grid grid-cols-[1fr_120px_120px_1fr_100px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors"
							>
								{/* Client Info */}
								<div className="min-w-0">
									<p className="text-sm font-medium text-foreground truncate">
										{client.client_name || "Unnamed Client"}
									</p>
									<CopyButton
										text={client.client_id}
										variant="skeleton"
										className="text-xs text-muted-foreground mt-0.5 max-w-[200px] h-auto p-0"
										innerClassName="text-xs"
									>
										{client.client_id.slice(0, 20)}...
									</CopyButton>
								</div>

								{/* Type */}
								<div>
									<Badge
										variant="muted"
										className={cn(
											"text-xs",
											client.public
												? "bg-blue-500/10 text-blue-600 border-blue-200"
												: "bg-purple-500/10 text-purple-600 border-purple-200",
										)}
									>
										{client.public ? "Public" : "Confidential"}
									</Badge>
								</div>

								{/* Status */}
								<div className="flex flex-col gap-1">
									<Badge
										variant="muted"
										className={cn(
											"text-xs w-fit",
											client.disabled
												? "bg-red-500/10 text-red-600 border-red-200"
												: "bg-green-500/10 text-green-600 border-green-200",
										)}
									>
										{client.disabled ? "Disabled" : "Active"}
									</Badge>
									{client.skip_consent && (
										<Badge
											variant="muted"
											className="text-xs w-fit bg-yellow-500/10 text-yellow-600 border-yellow-200"
										>
											Skip Consent
										</Badge>
									)}
								</div>

								{/* Redirect URIs */}
								<div className="min-w-0">
									<div className="flex flex-wrap gap-1">
										{client.redirect_uris?.slice(0, 2).map((uri, i) => (
											<span
												key={i}
												className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[180px]"
												title={uri}
											>
												{uri}
											</span>
										))}
										{(client.redirect_uris?.length || 0) > 2 && (
											<span className="text-xs text-muted-foreground">
												+{client.redirect_uris.length - 2} more
											</span>
										)}
										{!client.redirect_uris?.length && (
											<span className="text-xs text-muted-foreground">
												No redirect URIs
											</span>
										)}
									</div>
								</div>

								{/* Actions */}
								<div className="flex justify-end gap-1">
									{!client.public && (
										<IconButton
											variant="skeleton"
											size="icon"
											icon={<Key className="w-3.5 h-3.5" />}
											onClick={() => handleRotateSecret(client.client_id)}
											title="Rotate Secret"
										/>
									)}
									<IconButton
										variant="skeleton"
										size="icon"
										icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
										onClick={() => handleDeleteClient(client.client_id)}
										title="Delete Client"
									/>
								</div>
							</div>
						))
					)}
				</div>
			</div>

			{/* Create Dialog */}
			<CreateOAuthClientDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSuccess={() => {
					fetchClients();
					setCreateDialogOpen(false);
				}}
			/>
		</div>
	);
};
