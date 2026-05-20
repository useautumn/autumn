import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const CONFIRM_REMOVE_TEXT = "remove";
const CONFIRM_HIGH_RAMP_TEXT = "ramp";
const HIGH_RAMP_THRESHOLD = 25;

const migrationPercentSchema = z
	.string()
	.trim()
	.regex(/^\d+$/)
	.transform(Number)
	.pipe(z.number().int().min(0).max(100));

type AdminCacheV2RampResponse = {
	cache_v2_ramp: {
		host: string;
		migrationPercent: number;
		previousMigrationPercent: number;
		migrationChangedAt: number;
	} | null;
};

export function CacheV2RampDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();

	const [connectionString, setConnectionString] = useState("");
	const [migrationInputDraft, setMigrationInputDraft] = useState<string | null>(
		null,
	);
	const [removeConfirm, setRemoveConfirm] = useState("");
	const [rampConfirm, setRampConfirm] = useState("");

	const [saving, setSaving] = useState(false);
	const [updatingMigration, setUpdatingMigration] = useState(false);
	const [removing, setRemoving] = useState(false);

	const { data, isLoading, isError, refetch } =
		useQuery<AdminCacheV2RampResponse>({
			queryKey: ["admin-cache-v2-ramp"],
			queryFn: async () => {
				const { data } =
					await axiosInstance.get<AdminCacheV2RampResponse>(
						"/admin/cache-v2-ramp",
					);
				return data;
			},
			enabled: open,
		});

	const cfg = data?.cache_v2_ramp ?? null;
	const migrationInput =
		migrationInputDraft ?? (cfg ? String(cfg.migrationPercent) : "");

	useEffect(() => {
		if (isError && !data) toast.error("Failed to load cache V2 ramp config");
	}, [isError, data]);

	useEffect(() => {
		if (open) {
			setConnectionString("");
			setRemoveConfirm("");
			setRampConfirm("");
			setMigrationInputDraft(null);
		}
	}, [open]);

	const refreshAfterMutation = async () => {
		try {
			await refetch();
		} catch {
			// non-fatal
		}
	};

	const handleConnect = async () => {
		if (!connectionString.trim()) return;
		setSaving(true);
		try {
			await axiosInstance.patch("/admin/cache-v2-ramp", {
				connectionString: connectionString.trim(),
			});
			setConnectionString("");
			toast.success("Cache V2 ramp destination configured");
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to configure destination"));
		} finally {
			setSaving(false);
		}
	};

	const handleUpdateMigration = async () => {
		const parsed = migrationPercentSchema.safeParse(migrationInput);
		if (!parsed.success) {
			toast.error("Migration percent must be an integer between 0 and 100");
			return;
		}
		const percent = parsed.data;
		const currentPercent = cfg?.migrationPercent ?? 0;

		// High-ramp confirmation: large jumps OR crossing the threshold up.
		const crossingThreshold =
			percent >= HIGH_RAMP_THRESHOLD && currentPercent < HIGH_RAMP_THRESHOLD;
		const bigJump = percent - currentPercent >= HIGH_RAMP_THRESHOLD;
		if (
			(crossingThreshold || bigJump) &&
			rampConfirm !== CONFIRM_HIGH_RAMP_TEXT
		) {
			toast.error(
				`Type "${CONFIRM_HIGH_RAMP_TEXT}" in the confirmation field to apply ${currentPercent}% → ${percent}%`,
			);
			return;
		}

		setUpdatingMigration(true);
		try {
			await axiosInstance.patch("/admin/cache-v2-ramp/migration", {
				migrationPercent: percent,
			});
			toast.success(`Cache V2 ramp set to ${percent}%`);
			setMigrationInputDraft(null);
			setRampConfirm("");
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update ramp percent"));
		} finally {
			setUpdatingMigration(false);
		}
	};

	const handleRemove = async () => {
		if (removeConfirm !== CONFIRM_REMOVE_TEXT) return;
		setRemoving(true);
		try {
			await axiosInstance.delete("/admin/cache-v2-ramp");
			setRemoveConfirm("");
			toast.success("Cache V2 ramp config removed");
			await refreshAfterMutation();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove ramp config"));
		} finally {
			setRemoving(false);
		}
	};

	const pendingPercent = (() => {
		const parsed = migrationPercentSchema.safeParse(migrationInput);
		return parsed.success ? parsed.data : null;
	})();
	const currentPercent = cfg?.migrationPercent ?? 0;
	const requiresRampConfirm =
		pendingPercent !== null &&
		pendingPercent !== currentPercent &&
		(pendingPercent - currentPercent >= HIGH_RAMP_THRESHOLD ||
			(pendingPercent >= HIGH_RAMP_THRESHOLD &&
				currentPercent < HIGH_RAMP_THRESHOLD));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Cache V2 ramp</DialogTitle>
					<DialogDescription>
						Global percentage ramp routing customer cache traffic to a new V2
						Redis destination. Changes propagate to all servers within ~10
						seconds. Only active while the V2 instance is set to dragonfly.
					</DialogDescription>
				</DialogHeader>

				{isLoading ? (
					<div className="py-8 text-center text-tertiary-foreground text-sm">
						Loading…
					</div>
				) : cfg ? (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1">
							<FormLabel>Destination host</FormLabel>
							<Input
								value={cfg.host}
								readOnly
								className="font-mono text-xs"
							/>
							<span className="text-subtle text-[11px]">
								Connection string is encrypted at rest and never sent back to
								the frontend. To rotate credentials, set ramp to 0% then
								re-enter the full connection string below.
							</span>
						</div>

						<div className="flex flex-col gap-1">
							<FormLabel>Ramp percentage</FormLabel>
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
									% of customers routed to destination
								</span>
								<Button
									onClick={handleUpdateMigration}
									disabled={
										updatingMigration ||
										pendingPercent === null ||
										pendingPercent === cfg.migrationPercent ||
										(requiresRampConfirm &&
											rampConfirm !== CONFIRM_HIGH_RAMP_TEXT)
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
							{requiresRampConfirm && (
								<div className="mt-2 flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-2">
									<span className="text-[11px] text-amber-800">
										High-impact change ({currentPercent}% → {pendingPercent}%).
										Type <span className="font-mono">{CONFIRM_HIGH_RAMP_TEXT}</span>{" "}
										to confirm.
									</span>
									<Input
										value={rampConfirm}
										onChange={(e) => setRampConfirm(e.target.value)}
										placeholder={CONFIRM_HIGH_RAMP_TEXT}
										className="text-xs"
									/>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2 border-t border-stroke pt-4">
							<FormLabel>Rotate / replace connection string</FormLabel>
							<span className="text-subtle text-[11px]">
								{cfg.migrationPercent > 0
									? `Set ramp to 0% first (currently ${cfg.migrationPercent}%).`
									: "Paste a new redis:// or rediss:// URI to replace the stored connection string. Host stays for logs only."}
							</span>
							<div className="flex items-center gap-2">
								<Input
									value={connectionString}
									onChange={(e) => setConnectionString(e.target.value)}
									placeholder="rediss://default:password@host:port"
									disabled={cfg.migrationPercent > 0}
									className="font-mono text-xs"
								/>
								<Button
									onClick={handleConnect}
									disabled={
										saving ||
										cfg.migrationPercent > 0 ||
										!connectionString.trim()
									}
									size="sm"
								>
									{saving ? "Saving…" : "Replace"}
								</Button>
							</div>
						</div>

						<div className="flex flex-col gap-2 border-t border-stroke pt-4">
							<FormLabel>Remove ramp config</FormLabel>
							<span className="text-subtle text-xs">
								{cfg.migrationPercent > 0
									? `Set ramp to 0% first (currently ${cfg.migrationPercent}%).`
									: `Type "${CONFIRM_REMOVE_TEXT}" to confirm. This clears the destination and disconnects the client.`}
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
						<FormLabel>Destination connection string</FormLabel>
						<Input
							value={connectionString}
							onChange={(e) => setConnectionString(e.target.value)}
							placeholder="rediss://default:password@host:port"
							className="font-mono text-xs"
						/>
						<span className="text-subtle text-[11px]">
							Stored encrypted (AES-256-CBC). Frontend never sees the
							connection string after save — only the host. Ramp starts at 0%
							(no traffic routed) until you bump it.
						</span>
						<Button
							onClick={handleConnect}
							disabled={saving || !connectionString.trim()}
						>
							{saving ? "Saving…" : "Configure destination"}
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
