import { groupAndFormatScopes } from "@autumn/shared";
import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	IconButton,
	TableCell,
	TableRow,
} from "@autumn/ui";
import { EllipsisVertical, Key, Shield, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import { getBackendErr } from "@/utils/genUtils";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
} from "@/views/settings/SettingsTable";

interface OAuthConsent {
	readonly id: string;
	readonly clientId: string;
	readonly scopes: string[];
	readonly referenceId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

interface ClientInfo {
	readonly client_id: string;
	readonly name: string;
}

interface ApiKeyPreview {
	readonly prefix: string;
	readonly name: string;
	readonly env: string;
}

const COLUMNS = [
	{ label: "Application", width: "20%" },
	{ label: "Permissions", width: "50%" },
	{ label: "Authorized", width: "25%" },
] as const;

const ConsentRowToolbar = ({
	consentId,
	clientName,
	onRevoke,
}: {
	readonly consentId: string;
	readonly clientName: string;
	readonly onRevoke: (consentId: string, clientName: string) => void;
}) => {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="skeleton"
					size="icon"
					iconOrientation="center"
					icon={<EllipsisVertical />}
					className="!h-5 !w-5 rounded-lg hover:bg-interactive-secondary-hover"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="z-[200]">
				<DropdownMenuItem
					variant="destructive"
					className="flex justify-between"
					onClick={() => {
						onRevoke(consentId, clientName);
						setOpen(false);
					}}
				>
					<div className="flex justify-between items-center w-full gap-4">
						<span>Revoke</span>
						<TrashIcon size={12} />
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export const AuthorizedApps = () => {
	const [consents, setConsents] = useState<OAuthConsent[]>([]);
	const [clientNames, setClientNames] = useState<Record<string, string>>({});
	const [isLoading, setIsLoading] = useState(true);
	const [revokingId, setRevokingId] = useState<string | null>(null);
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
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/consents`,
				{ credentials: "include" },
			);
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				toast.error(error.message || "Failed to fetch authorized apps");
				return;
			}
			const data = await response.json();
			const consentList = (data.consents as OAuthConsent[]) || [];
			setConsents(consentList);
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
		try {
			const response = await fetch(
				`${import.meta.env.VITE_BACKEND_URL}/consents/${consentId}/api-keys`,
				{ credentials: "include" },
			);
			if (response.ok) {
				const data = await response.json();
				setLinkedApiKeys(data.apiKeys || []);
			}
		} catch {
			// Silent — dialog still usable without API key preview
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
				{ method: "DELETE", credentials: "include" },
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

	if (isLoading) return null;

	if (consents.length === 0) {
		return (
			<div className="rounded-lg shadow-card border bg-interactive-secondary px-4 py-12 text-center">
				<Shield className="size-8 mx-auto mb-3 text-subtle" />
				<p className="text-sm text-tertiary-foreground">
					No applications have been authorized
				</p>
				<p className="text-xs text-subtle mt-1">
					When you authorize an app to access this organization, it will appear
					here
				</p>
			</div>
		);
	}

	return (
		<>
			<SettingsTable columns={COLUMNS}>
				{consents.map((consent) => {
					const grouped = groupAndFormatScopes(consent.scopes);
					const name = clientNames[consent.clientId] || "Loading...";
					return (
						<TableRow key={consent.id} className={SETTINGS_ROW_CLASS}>
							<TableCell className="pl-4 text-foreground font-medium">
								{name}
							</TableCell>
							<TableCell>
								<div className="flex flex-wrap gap-1">
									{grouped.length === 0 ? (
										<span className="text-xs text-tertiary-foreground">
											No permissions
										</span>
									) : (
										grouped.map((p) => (
											<Badge key={p.resource} variant="muted" size="sm">
												{p.resourceName}: {p.actions.join(", ")}
											</Badge>
										))
									)}
								</div>
							</TableCell>
							<TableCell className="text-tertiary-foreground text-xs">
								{formatDateStr(consent.createdAt)}
							</TableCell>
							<TableCell className="pr-2">
								<div className="flex justify-end">
									<ConsentRowToolbar
										consentId={consent.id}
										clientName={name}
										onRevoke={handleRevokeClick}
									/>
								</div>
							</TableCell>
						</TableRow>
					);
				})}
			</SettingsTable>

			<Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Revoke Access</DialogTitle>
						<DialogDescription>
							Are you sure you want to revoke access for{" "}
							<span className="font-semibold text-foreground">
								{revokeTarget?.clientName}
							</span>
							? This app will no longer be able to access your organization.
						</DialogDescription>
					</DialogHeader>
					{loadingApiKeys ? (
						<div className="py-3 text-sm text-tertiary-foreground">
							Checking for linked API keys...
						</div>
					) : linkedApiKeys.length > 0 ? (
						<div className="py-2">
							<div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
								<Key className="size-4" />
								<span>The following API keys will also be deleted:</span>
							</div>
							<div className="space-y-1.5 bg-input/50 dark:bg-input/30 rounded-md p-3">
								{linkedApiKeys.map((key, index) => (
									<div
										key={index}
										className="flex items-center justify-between text-sm"
									>
										<code className="font-mono text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
											{key.prefix}...
										</code>
										<div className="flex items-center gap-2">
											<span className="text-tertiary-foreground text-xs">
												{key.name}
											</span>
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
		</>
	);
};
