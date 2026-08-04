import { Badge, Button, FormLabel, Input } from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	CONFIRM_REMOVE_BACKUP_TEXT,
	isBackupLive,
	MISC_REDIS_CONFIG_QUERY_KEY,
	type MiscRedisConfigResponse,
} from "./miscRedisConfigTypes";

export const MiscRedisBackupForm = ({
	config,
}: {
	config: MiscRedisConfigResponse;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState({ public: "", private: "" });
	const [removeConfirm, setRemoveConfirm] = useState("");

	const backupLive = isBackupLive(config);

	const invalidateConfig = async () => {
		await queryClient.invalidateQueries({
			queryKey: MISC_REDIS_CONFIG_QUERY_KEY,
		});
	};

	const upsertMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.patch("/admin/misc-redis-config/backup", {
				publicConnectionString: draft.public.trim(),
				...(draft.private.trim()
					? { privateConnectionString: draft.private.trim() }
					: {}),
			});
		},
		onSuccess: async () => {
			setDraft({ public: "", private: "" });
			toast.success("Backup destination configured");
			await invalidateConfig();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to configure backup"));
		},
	});

	const removeMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete("/admin/misc-redis-config/backup");
		},
		onSuccess: async () => {
			setRemoveConfirm("");
			toast.success("Backup destination removed");
			await invalidateConfig();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to remove backup"));
		},
	});

	return (
		<div className="flex flex-col gap-2">
			<FormLabel>Backup destination</FormLabel>

			{config.backup && (
				<div className="flex items-center gap-2">
					<Input
						value={config.backup.host}
						readOnly
						className="font-mono text-xs"
					/>
					<Badge variant="muted">
						{config.backup.hasPrivateConnectionString
							? "private endpoint set"
							: "public only"}
					</Badge>
				</div>
			)}

			<p className="text-pretty text-xs text-tertiary-foreground">
				{backupLive
					? "The backup is live (active or a ramp target) — its connection can't be changed until traffic moves off it."
					: "Stored encrypted; only the host is ever shown again. The public URI is reachable from anywhere; ECS prefers the optional private/VPC endpoint when set."}
			</p>

			<Input
				value={draft.public}
				onChange={(e) => setDraft({ ...draft, public: e.target.value })}
				placeholder="rediss://default:password@public-host:port"
				disabled={backupLive}
				className="font-mono text-xs"
			/>
			<div className="flex items-center gap-2">
				<Input
					value={draft.private}
					onChange={(e) => setDraft({ ...draft, private: e.target.value })}
					placeholder="rediss://default:password@private-host:port (optional)"
					disabled={backupLive}
					className="font-mono text-xs"
				/>
				<Button
					size="sm"
					onClick={() => upsertMutation.mutate()}
					isLoading={upsertMutation.isPending}
					disabled={backupLive || !draft.public.trim()}
				>
					{config.backup ? "Replace" : "Configure"}
				</Button>
			</div>

			{config.backup && (
				<div className="mt-1 flex items-center gap-2">
					<Input
						value={removeConfirm}
						onChange={(e) => setRemoveConfirm(e.target.value)}
						placeholder={CONFIRM_REMOVE_BACKUP_TEXT}
						disabled={backupLive}
						className="w-32 text-xs"
					/>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => removeMutation.mutate()}
						isLoading={removeMutation.isPending}
						disabled={
							backupLive || removeConfirm !== CONFIRM_REMOVE_BACKUP_TEXT
						}
					>
						Remove
					</Button>
				</div>
			)}
		</div>
	);
};
