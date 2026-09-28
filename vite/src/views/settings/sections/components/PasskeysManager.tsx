import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
	TableCell,
	TableRow,
} from "@autumn/ui";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { formatDateStr } from "@/utils/formatUtils/formatDateUtils";
import {
	SETTINGS_ROW_CLASS,
	SettingsTable,
} from "@/views/settings/SettingsTable";

const COLUMNS = [
	{ label: "Name", width: "40%" },
	{ label: "Type", width: "25%" },
	{ label: "Added", width: "25%" },
] as const;

type Passkey = {
	id: string;
	name?: string | null;
	deviceType?: string | null;
	backedUp?: boolean | null;
	createdAt?: string | Date | null;
};

const friendlyDeviceType = (deviceType: string | null | undefined) => {
	if (!deviceType) return "Unknown";
	if (deviceType === "multiDevice") return "Synced";
	if (deviceType === "singleDevice") return "Device-bound";
	return deviceType;
};

export const PasskeysManager = () => {
	const passkeysQuery = authClient.useListPasskeys();
	const passkeys = (passkeysQuery.data as Passkey[] | undefined) ?? [];
	const isLoading = passkeysQuery.isPending;
	const isError = passkeysQuery.error;

	const [addOpen, setAddOpen] = useState(false);
	const [passkeyName, setPasskeyName] = useState("");
	const [adding, setAdding] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	const handleAdd = async () => {
		const trimmedName = passkeyName.trim();
		if (!trimmedName) {
			toast.error("Give your passkey a name");
			return;
		}
		setAdding(true);
		try {
			const { error } = await authClient.passkey.addPasskey({
				name: trimmedName,
			});
			if (error) {
				const msg = error.message || "";
				if (
					msg.toLowerCase().includes("cancel") ||
					msg.toLowerCase().includes("aborted") ||
					msg.toLowerCase().includes("not allowed")
				) {
					// Don't toast on cancel — user intentionally dismissed
					return;
				}
				toast.error(error.message || "Failed to add passkey");
				return;
			}
			toast.success("Passkey added");
			setAddOpen(false);
			setPasskeyName("");
		} catch (err) {
			// User-cancelled WebAuthn prompts surface as DOMExceptions
			const msg = err instanceof Error ? err.message : "Failed to add passkey";
			if (
				msg.toLowerCase().includes("cancel") ||
				msg.toLowerCase().includes("aborted") ||
				msg.toLowerCase().includes("not allowed")
			) {
				// Don't toast on cancel — user intentionally dismissed
				return;
			}
			toast.error(msg);
		} finally {
			setAdding(false);
		}
	};

	const handleDelete = async (id: string) => {
		setConfirmDeleteId(id);
	};

	const confirmDelete = async () => {
		if (!confirmDeleteId) return;
		setDeletingId(confirmDeleteId);
		try {
			const { error } = await authClient.passkey.deletePasskey({
				id: confirmDeleteId,
			});
			if (error) {
				toast.error(error.message || "Failed to remove passkey");
				return;
			}
			toast.success("Passkey removed");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to remove passkey",
			);
		} finally {
			setDeletingId(null);
			setConfirmDeleteId(null);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium text-foreground">Passkeys</h3>
					<p className="text-xs text-tertiary-foreground mt-0.5">
						Sign in faster with Touch ID, Face ID, or a security key.
					</p>
				</div>
				<Dialog open={addOpen} onOpenChange={setAddOpen}>
					<Button
						variant="secondary"
						onClick={() => setAddOpen(true)}
						className="gap-2"
					>
						<KeyRound size={14} />
						Add passkey
					</Button>
					<DialogContent className="w-md bg-card">
						<DialogHeader>
							<DialogTitle>Add a passkey</DialogTitle>
							<DialogDescription>
								Give your passkey a name so you can identify it later (e.g.
								"MacBook" or "iPhone").
							</DialogDescription>
						</DialogHeader>
						<div>
							<FormLabel>
								<span className="text-muted-foreground">Name</span>
							</FormLabel>
							<Input
								autoFocus
								value={passkeyName}
								onChange={(e) => setPasskeyName(e.target.value)}
								placeholder="My MacBook"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										handleAdd();
									}
								}}
							/>
						</div>
						<DialogFooter>
							<Button
								variant="muted"
								onClick={() => {
									setAddOpen(false);
									setPasskeyName("");
								}}
								disabled={adding}
							>
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={handleAdd}
								isLoading={adding}
								disabled={!passkeyName.trim()}
							>
								Continue
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{isLoading ? (
				<p className="text-tertiary-foreground text-sm py-4">
					Loading passkeys…
				</p>
			) : isError ? (
				<p className="text-tertiary-foreground text-sm py-4">
					Failed to load passkeys.
				</p>
			) : passkeys.length === 0 ? (
				<p className="text-tertiary-foreground text-sm py-4">
					No passkeys yet. Add one to sign in without a code.
				</p>
			) : (
				<SettingsTable columns={COLUMNS}>
					{passkeys.map((pk) => (
						<TableRow key={pk.id} className={SETTINGS_ROW_CLASS}>
							<TableCell className="pl-4 text-foreground">
								{pk.name || "Unnamed passkey"}
							</TableCell>
							<TableCell>
								<Badge variant="muted">
									{friendlyDeviceType(pk.deviceType)}
								</Badge>
							</TableCell>
							<TableCell className="text-tertiary-foreground text-xs">
								{pk.createdAt ? formatDateStr(pk.createdAt) : "—"}
							</TableCell>
							<TableCell className="pr-2">
								<div className="flex justify-end">
									<Button
										variant="muted"
										size="sm"
										onClick={() => handleDelete(pk.id)}
										isLoading={deletingId === pk.id}
										className="h-7 px-2 text-tertiary-foreground hover:text-destructive"
										aria-label={`Remove ${pk.name || "passkey"}`}
									>
										<Trash2 size={14} />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					))}
				</SettingsTable>
			)}

			<Dialog
				open={!!confirmDeleteId}
				onOpenChange={(open) => {
					if (!open) setConfirmDeleteId(null);
				}}
			>
				<DialogContent className="w-md bg-card">
					<DialogHeader>
						<DialogTitle>Remove passkey</DialogTitle>
						<DialogDescription>
							Are you sure you want to remove this passkey? This action cannot
							be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="muted"
							onClick={() => setConfirmDeleteId(null)}
							disabled={!!deletingId}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={confirmDelete}
							isLoading={!!deletingId}
						>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};
