import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	FormLabel,
	Input,
	Separator,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	CACHE_V2_RAMP_QUERY_KEY,
	type CacheV2Ramp,
	CONFIRM_HIGH_RAMP_TEXT,
	CONFIRM_REMOVE_TEXT,
	migrationPercentSchema,
	requiresHighRampConfirm,
} from "./cacheV2RampTypes";

export const CacheV2RampConfigForm = ({ ramp }: { ramp: CacheV2Ramp }) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const [percentDraft, setPercentDraft] = useState(
		String(ramp.migrationPercent),
	);
	const [rampConfirm, setRampConfirm] = useState("");
	const [connectionString, setConnectionString] = useState("");
	const [removeConfirm, setRemoveConfirm] = useState("");

	const invalidateRamp = async () => {
		await queryClient.invalidateQueries({ queryKey: CACHE_V2_RAMP_QUERY_KEY });
	};

	const updateMigrationMutation = useMutation({
		mutationFn: async (migrationPercent: number) => {
			await axiosInstance.patch("/admin/cache-v2-ramp/migration", {
				migrationPercent,
			});
		},
		onSuccess: async (_data, migrationPercent) => {
			toast.success(`Cache V2 ramp set to ${migrationPercent}%`);
			setRampConfirm("");
			await invalidateRamp();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update ramp percent"));
		},
	});

	const replaceConnectionMutation = useMutation({
		mutationFn: async (uri: string) => {
			await axiosInstance.patch("/admin/cache-v2-ramp", {
				connectionString: uri,
			});
		},
		onSuccess: async () => {
			setConnectionString("");
			toast.success("Cache V2 ramp destination configured");
			await invalidateRamp();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to configure destination"));
		},
	});

	const removeMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete("/admin/cache-v2-ramp");
		},
		onSuccess: async () => {
			setRemoveConfirm("");
			toast.success("Cache V2 ramp config removed");
			await invalidateRamp();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to remove ramp config"));
		},
	});

	const parsedPercent = migrationPercentSchema.safeParse(percentDraft);
	const pendingPercent = parsedPercent.success ? parsedPercent.data : null;
	const currentPercent = ramp.migrationPercent;
	const needsRampConfirm =
		pendingPercent !== null &&
		pendingPercent !== currentPercent &&
		requiresHighRampConfirm({ nextPercent: pendingPercent, currentPercent });
	const rampConfirmed = rampConfirm === CONFIRM_HIGH_RAMP_TEXT;
	const rampIsLive = currentPercent > 0;

	const handleUpdateMigration = () => {
		if (!parsedPercent.success) {
			toast.error("Migration percent must be an integer between 0 and 100");
			return;
		}
		if (needsRampConfirm && !rampConfirmed) {
			toast.error(
				`Type "${CONFIRM_HIGH_RAMP_TEXT}" in the confirmation field to apply ${currentPercent}% → ${parsedPercent.data}%`,
			);
			return;
		}
		updateMigrationMutation.mutate(parsedPercent.data);
	};

	const handleReplaceConnection = () => {
		const trimmed = connectionString.trim();
		if (!trimmed) return;
		replaceConnectionMutation.mutate(trimmed);
	};

	const handleRemove = () => {
		if (removeConfirm !== CONFIRM_REMOVE_TEXT) return;
		removeMutation.mutate();
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-2">
				<FormLabel>Ramp percentage</FormLabel>
				<div className="flex items-center gap-2">
					<Input
						type="number"
						min={0}
						max={100}
						value={percentDraft}
						onChange={(e) => setPercentDraft(e.target.value)}
						className="w-24 tabular-nums"
					/>
					<span className="text-xs text-tertiary-foreground">
						% of customers sent to the new Redis
					</span>
					<Button
						onClick={handleUpdateMigration}
						isLoading={updateMigrationMutation.isPending}
						disabled={
							pendingPercent === null ||
							pendingPercent === currentPercent ||
							(needsRampConfirm && !rampConfirmed)
						}
						size="sm"
					>
						Update
					</Button>
				</div>
				{ramp.previousMigrationPercent !== currentPercent && (
					<span className="text-xs text-tertiary-foreground">
						Previously {ramp.previousMigrationPercent}%, changed{" "}
						{new Date(ramp.migrationChangedAt).toLocaleString()}
					</span>
				)}
				{needsRampConfirm && (
					<Alert>
						<AlertTitle>
							Large jump: {currentPercent}% → {pendingPercent}%
						</AlertTitle>
						<AlertDescription className="flex flex-col gap-2">
							<span>
								Type <span className="font-mono">{CONFIRM_HIGH_RAMP_TEXT}</span>{" "}
								to confirm.
							</span>
							<Input
								value={rampConfirm}
								onChange={(e) => setRampConfirm(e.target.value)}
								placeholder={CONFIRM_HIGH_RAMP_TEXT}
								className="text-xs"
							/>
						</AlertDescription>
					</Alert>
				)}
			</div>

			<Separator />

			<div className="flex flex-col gap-2">
				<FormLabel>Destination host</FormLabel>
				<Input value={ramp.host} readOnly className="font-mono text-xs" />
				<p className="text-pretty text-xs text-tertiary-foreground">
					{rampIsLive
						? `Set the ramp to 0% before rotating credentials (currently ${currentPercent}%).`
						: "Paste a new redis:// or rediss:// URI to replace the stored credentials."}
				</p>
				<div className="flex items-center gap-2">
					<Input
						value={connectionString}
						onChange={(e) => setConnectionString(e.target.value)}
						placeholder="rediss://default:password@host:port"
						disabled={rampIsLive}
						className="font-mono text-xs"
					/>
					<Button
						onClick={handleReplaceConnection}
						isLoading={replaceConnectionMutation.isPending}
						disabled={rampIsLive || !connectionString.trim()}
						size="sm"
					>
						Replace
					</Button>
				</div>
			</div>

			<Separator />

			<div className="flex flex-col gap-2">
				<FormLabel>Remove ramp config</FormLabel>
				<p className="text-pretty text-xs text-tertiary-foreground">
					{rampIsLive
						? `Set the ramp to 0% before removing it (currently ${currentPercent}%).`
						: `Clears the destination and disconnects. Type "${CONFIRM_REMOVE_TEXT}" to confirm.`}
				</p>
				<div className="flex items-center gap-2">
					<Input
						value={removeConfirm}
						onChange={(e) => setRemoveConfirm(e.target.value)}
						placeholder={CONFIRM_REMOVE_TEXT}
						disabled={rampIsLive}
						className="text-xs"
					/>
					<Button
						variant="destructive"
						size="sm"
						onClick={handleRemove}
						isLoading={removeMutation.isPending}
						disabled={rampIsLive || removeConfirm !== CONFIRM_REMOVE_TEXT}
					>
						Remove
					</Button>
				</div>
			</div>
		</div>
	);
};
