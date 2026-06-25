import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	FormLabel,
	Input,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const CONFIRM_REMOVE_TEXT = "remove";

const migrationPercentSchema = z
	.string()
	.trim()
	.regex(/^\d+$/)
	.transform(Number)
	.pipe(z.number().int().min(0).max(100));

type AdminOrgRedisConfigResponse = {
	org_id: string;
	org_slug: string;
	redis_config: {
		host: string;
		migrationPercent: number;
		previousMigrationPercent: number;
		migrationChangedAt: number;
	} | null;
};

export function OrgRedisConfigDialog({
	open,
	onOpenChange,
	orgId,
	orgName,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId?: string;
	orgName?: string;
	onSaved: () => void | Promise<void>;
}) {
	const axiosInstance = useAxiosInstance();

	const [connectionString, setConnectionString] = useState("");
	// `null` = "show the current server value". A string means the admin has
	// typed something; that draft takes precedence until a successful update
	// or a dialog reopen clears it. Deriving `migrationInput` during render
	// (below) lets us avoid a useEffect that watches `data` to sync state.
	const [migrationInputDraft, setMigrationInputDraft] = useState<string | null>(
		null,
	);
	const [removeConfirm, setRemoveConfirm] = useState("");

	const [saving, setSaving] = useState(false);
	const [updatingMigration, setUpdatingMigration] = useState(false);
	const [removing, setRemoving] = useState(false);

	const { data, isLoading, isError, refetch } =
		useQuery<AdminOrgRedisConfigResponse>({
			queryKey: ["admin-org-redis", orgId],
			queryFn: async () => {
				const { data } = await axiosInstance.get<AdminOrgRedisConfigResponse>(
					`/admin/orgs/${orgId}/redis`,
				);
				return data;
			},
			enabled: open && !!orgId,
		});

	const cfg = data?.redis_config ?? null;
	const migrationInput =
		migrationInputDraft ?? (cfg ? String(cfg.migrationPercent) : "");

	// Surface load failures as a toast — only when there's no data to fall
	// back on. After a successful mutation triggers a refetch, transient GET
	// failures shouldn't surface as "Failed to load" since the dialog can
	// keep displaying the previous data.
	useEffect(() => {
		if (isError && !data) toast.error("Failed to load Redis config");
	}, [isError, data]);

	// Reset transient inputs whenever the dialog opens (or switches org).
	// `migrationInputDraft = null` falls back to the server value during
	// render, so a previously typed but unsaved value can't carry over into
	// the next session.
	useEffect(() => {
		if (open && orgId) {
			setConnectionString("");
			setRemoveConfirm("");
			setMigrationInputDraft(null);
		}
	}, [open, orgId]);

	// Best-effort post-mutation refetch + parent notification. Failures here
	// must not surface as errors because the mutation has already persisted —
	// a transient GET failure should not be reported as
	// "Failed to connect/update/remove". Each step is independent so a failure
	// in `refetch()` (local dialog state) doesn't skip `onSaved()` (parent
	// table refetch), and vice versa.
	const refreshAfterMutation = async () => {
		try {
			await refetch();
		} catch {
			// non-fatal: dialog will display stale state until reopened
		}
		try {
			await onSaved();
		} catch {
			// non-fatal: parent table will refetch on its next render cycle
		}
	};

	const handleConnect = async () => {
		if (!orgId || !connectionString.trim()) return;
		setSaving(true);
		try {
			await axiosInstance.patch(`/admin/orgs/${orgId}/redis`, {
				connectionString: connectionString.trim(),
			});
			setConnectionString("");
			toast.success("Redis connected");
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to connect Redis"));
		} finally {
			setSaving(false);
		}
	};

	const handleUpdateMigration = async () => {
		if (!orgId) return;
		const parsed = migrationPercentSchema.safeParse(migrationInput);
		if (!parsed.success) {
			toast.error("Migration percent must be an integer between 0 and 100");
			return;
		}
		const percent = parsed.data;
		setUpdatingMigration(true);
		try {
			await axiosInstance.patch(`/admin/orgs/${orgId}/redis/migration`, {
				migrationPercent: percent,
			});
			toast.success(`Migration updated to ${percent}%`);
			// Drop the draft so the input re-derives from the new server value.
			setMigrationInputDraft(null);
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update migration"));
		} finally {
			setUpdatingMigration(false);
		}
	};

	const handleRemove = async () => {
		if (!orgId || removeConfirm !== CONFIRM_REMOVE_TEXT) return;
		setRemoving(true);
		try {
			await axiosInstance.delete(`/admin/orgs/${orgId}/redis`);
			setRemoveConfirm("");
			toast.success("Redis config removed");
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove Redis config"));
		} finally {
			setRemoving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Redis routing — {orgName ?? orgId}</DialogTitle>
					<DialogDescription>
						Configure a dedicated Redis instance for this org. Customer cache
						and balance ops route by migration percentage.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="py-8 text-center text-tertiary-foreground text-sm">
						Loading…
					</div>
				) : cfg ? (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1">
							<FormLabel>Connected host</FormLabel>
							<Input value={cfg.host} readOnly className="font-mono text-xs" />
						</div>

						<div className="flex flex-col gap-1">
							<FormLabel>Migration percentage</FormLabel>
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0}
									max={100}
									value={migrationInput}
									onChange={(e) => setMigrationInputDraft(e.target.value)}
									className="w-24 font-mono text-xs"
								/>
								<span className="text-tertiary-foreground text-xs">
									% of customers routed to this Redis
								</span>
								<Button
									onClick={handleUpdateMigration}
									disabled={
										updatingMigration ||
										Number(migrationInput) === cfg.migrationPercent
									}
									size="sm"
								>
									{updatingMigration ? "Updating…" : "Update"}
								</Button>
							</div>
							{cfg.previousMigrationPercent !== cfg.migrationPercent && (
								<span className="text-subtle text-[11px]">
									Previous: {cfg.previousMigrationPercent}% — changed{" "}
									{new Date(cfg.migrationChangedAt).toLocaleString()}
								</span>
							)}
						</div>

						<div className="flex flex-col gap-2 border-t border-stroke pt-4">
							<FormLabel>Remove Redis config</FormLabel>
							<span className="text-subtle text-xs">
								{cfg.migrationPercent > 0
									? `Set migrationPercent to 0 first (currently ${cfg.migrationPercent}%).`
									: `Type "${CONFIRM_REMOVE_TEXT}" to confirm removal.`}
							</span>
							<div className="flex items-center gap-2">
								<Input
									value={removeConfirm}
									onChange={(e) => setRemoveConfirm(e.target.value)}
									placeholder={CONFIRM_REMOVE_TEXT}
									disabled={cfg.migrationPercent > 0}
									className="text-xs"
								/>
								<Button
									variant="destructive"
									size="sm"
									onClick={handleRemove}
									disabled={
										removing ||
										cfg.migrationPercent > 0 ||
										removeConfirm !== CONFIRM_REMOVE_TEXT
									}
								>
									{removing ? "Removing…" : "Remove"}
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<FormLabel>Redis connection string</FormLabel>
						<Input
							value={connectionString}
							onChange={(e) => setConnectionString(e.target.value)}
							placeholder="rediss://default:password@host:port"
							className="font-mono text-xs"
						/>
						<span className="text-subtle text-[11px]">
							Stored encrypted (AES-256-CBC). Frontend never sees the connection
							string after save — only the host. Migration starts at 0% (no
							traffic routed) until you bump it.
						</span>
						<Button
							onClick={handleConnect}
							disabled={saving || !connectionString.trim()}
						>
							{saving ? "Connecting…" : "Connect Redis"}
						</Button>
					</div>
				)}

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
