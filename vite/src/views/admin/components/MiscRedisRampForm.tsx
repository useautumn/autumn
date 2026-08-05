import {
	Alert,
	AlertDescription,
	AlertTitle,
	Button,
	FormLabel,
	Input,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	CONFIRM_CLEAR_RAMP_TEXT,
	CONFIRM_HIGH_RAMP_TEXT,
	MISC_REDIS_CONFIG_QUERY_KEY,
	type MiscRedisConfigResponse,
	otherInstance,
	rampPercentSchema,
	requiresHighRampConfirm,
} from "./miscRedisConfigTypes";

export const MiscRedisRampForm = ({
	config,
}: {
	config: MiscRedisConfigResponse;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const ramp = config.ramp;
	const rampTarget = otherInstance(config.activeInstance);

	const [percentDraft, setPercentDraft] = useState(String(ramp?.percent ?? 0));
	const [rampConfirm, setRampConfirm] = useState("");
	const [clearConfirm, setClearConfirm] = useState("");

	const invalidateConfig = async () => {
		await queryClient.invalidateQueries({
			queryKey: MISC_REDIS_CONFIG_QUERY_KEY,
		});
	};

	const startRampMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.post("/admin/misc-redis-config/ramp", {});
		},
		onSuccess: async () => {
			toast.success(`Ramp toward "${rampTarget}" configured at 0%`);
			await invalidateConfig();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to start ramp"));
		},
	});

	const updatePercentMutation = useMutation({
		mutationFn: async (percent: number) => {
			await axiosInstance.post("/admin/misc-redis-config/ramp", { percent });
		},
		onSuccess: async (_data, percent) => {
			toast.success(`Ramp set to ${percent}%`);
			setRampConfirm("");
			await invalidateConfig();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update ramp percent"));
		},
	});

	const clearRampMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete("/admin/misc-redis-config/ramp");
		},
		onSuccess: async () => {
			toast.success("Ramp cleared — all traffic back on the active instance");
			setClearConfirm("");
			await invalidateConfig();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to clear ramp"));
		},
	});

	if (!ramp) {
		return (
			<div className="flex flex-col gap-2">
				<FormLabel>Migration ramp</FormLabel>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						onClick={() => startRampMutation.mutate()}
						isLoading={startRampMutation.isPending}
						disabled={rampTarget === "backup" && !config.backup}
					>
						Start ramp → {rampTarget}
					</Button>
					<span className="text-pretty text-xs text-tertiary-foreground">
						{rampTarget === "backup" && !config.backup
							? "Configure the backup connection first."
							: "Starts at 0% — invalidations fan out to the target before any read traffic moves."}
					</span>
				</div>
			</div>
		);
	}

	const parsedPercent = rampPercentSchema.safeParse(percentDraft);
	const pendingPercent = parsedPercent.success ? parsedPercent.data : null;
	const needsRampConfirm =
		pendingPercent !== null &&
		pendingPercent !== ramp.percent &&
		requiresHighRampConfirm({
			nextPercent: pendingPercent,
			currentPercent: ramp.percent,
		});
	const rampConfirmed = rampConfirm === CONFIRM_HIGH_RAMP_TEXT;

	const handleUpdatePercent = () => {
		if (pendingPercent === null) {
			toast.error("Ramp percent must be an integer between 0 and 100");
			return;
		}
		if (needsRampConfirm && !rampConfirmed) {
			toast.error(
				`Type "${CONFIRM_HIGH_RAMP_TEXT}" in the confirmation field to apply ${ramp.percent}% → ${pendingPercent}%`,
			);
			return;
		}
		updatePercentMutation.mutate(pendingPercent);
	};

	return (
		<div className="flex flex-col gap-2">
			<FormLabel>
				Migration ramp{" "}
				<span className="font-mono text-xs text-tertiary-foreground">
					{config.activeInstance} → {rampTarget}
				</span>
			</FormLabel>
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
					% of requests read from {rampTarget}
				</span>
				<Button
					size="sm"
					onClick={handleUpdatePercent}
					isLoading={updatePercentMutation.isPending}
					disabled={
						pendingPercent === null ||
						pendingPercent === ramp.percent ||
						(needsRampConfirm && !rampConfirmed)
					}
				>
					Update
				</Button>
			</div>
			{ramp.previousPercent !== ramp.percent && (
				<span className="text-xs text-tertiary-foreground">
					Previously {ramp.previousPercent}%, changed{" "}
					{new Date(ramp.changedAt).toLocaleString()}
				</span>
			)}
			{needsRampConfirm && (
				<Alert>
					<AlertTitle>
						Large jump: {ramp.percent}% → {pendingPercent}%
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

			<div className="mt-1 flex items-center gap-2">
				<Input
					value={clearConfirm}
					onChange={(e) => setClearConfirm(e.target.value)}
					placeholder={CONFIRM_CLEAR_RAMP_TEXT}
					className="w-32 text-xs"
				/>
				<Button
					variant="destructive"
					size="sm"
					onClick={() => clearRampMutation.mutate()}
					isLoading={clearRampMutation.isPending}
					disabled={clearConfirm !== CONFIRM_CLEAR_RAMP_TEXT}
				>
					Clear ramp
				</Button>
				<span className="text-pretty text-xs text-tertiary-foreground">
					Instant rollback to {config.activeInstance}.
				</span>
			</div>
		</div>
	);
};
