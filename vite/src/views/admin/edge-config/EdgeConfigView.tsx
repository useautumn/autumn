import { useMutation, useQuery } from "@tanstack/react-query";
import {
	ArrowLeft,
	ChevronDown,
	ChevronRight,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";

type RolloutPercent = {
	percent: number;
	previousPercent: number;
	changedAt: number;
};

type RolloutEntry = RolloutPercent & {
	orgs: Record<string, RolloutPercent>;
};

type RolloutsResponse = {
	rollouts: Record<string, RolloutEntry>;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

const formatTimestamp = (timestamp: number) => {
	if (!timestamp) return "Never";
	return new Date(timestamp).toLocaleString();
};

const RolloutOrgRow = ({
	rolloutId,
	orgId,
	orgEntry,
	onUpdate,
	onDelete,
}: {
	rolloutId: string;
	orgId: string;
	orgEntry: RolloutPercent;
	onUpdate: ({
		rolloutId,
		orgId,
		percent,
	}: { rolloutId: string; orgId: string; percent: number }) => void;
	onDelete: ({
		rolloutId,
		orgId,
	}: { rolloutId: string; orgId: string }) => void;
}) => {
	const [editPercent, setEditPercent] = useState(orgEntry.percent);

	return (
		<div className="flex items-center gap-3 py-2 px-3 bg-t1 rounded-md">
			<code className="text-xs flex-1 font-mono">{orgId}</code>
			<input
				type="number"
				min={0}
				max={100}
				value={editPercent}
				onChange={(e) => setEditPercent(Number(e.target.value))}
				className="w-16 px-2 py-1 text-xs border rounded bg-background"
			/>
			<span className="text-xs text-t3">%</span>
			<button
				type="button"
				onClick={() => onUpdate({ rolloutId, orgId, percent: editPercent })}
				disabled={editPercent === orgEntry.percent}
				className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded disabled:opacity-40"
			>
				Save
			</button>
			<IconButton
				icon={<Trash2 className="w-3.5 h-3.5" />}
				variant="ghost"
				size="sm"
				onClick={() => onDelete({ rolloutId, orgId })}
			/>
			<span className="text-[10px] text-t3">
				prev: {orgEntry.previousPercent}% | changed:{" "}
				{formatTimestamp(orgEntry.changedAt)}
			</span>
		</div>
	);
};

const RolloutCard = ({
	rolloutId,
	entry,
	onUpdateGlobal,
	onUpdateOrg,
	onDeleteOrg,
	onAddOrg,
}: {
	rolloutId: string;
	entry: RolloutEntry;
	onUpdateGlobal: ({
		rolloutId,
		percent,
	}: { rolloutId: string; percent: number }) => void;
	onUpdateOrg: ({
		rolloutId,
		orgId,
		percent,
	}: { rolloutId: string; orgId: string; percent: number }) => void;
	onDeleteOrg: ({
		rolloutId,
		orgId,
	}: { rolloutId: string; orgId: string }) => void;
	onAddOrg: ({ rolloutId }: { rolloutId: string }) => void;
}) => {
	const [expanded, setExpanded] = useState(true);
	const [globalPercent, setGlobalPercent] = useState(entry.percent);

	const orgEntries = Object.entries(entry.orgs);

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="flex items-center gap-3 p-4 bg-t1/50">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="text-t3"
				>
					{expanded ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</button>
				<h3 className="font-mono font-medium text-sm flex-1">{rolloutId}</h3>
				<div className="flex items-center gap-2">
					<span className="text-xs text-t3">Global:</span>
					<input
						type="number"
						min={0}
						max={100}
						value={globalPercent}
						onChange={(e) => setGlobalPercent(Number(e.target.value))}
						className="w-16 px-2 py-1 text-xs border rounded bg-background"
					/>
					<span className="text-xs text-t3">%</span>
					<button
						type="button"
						onClick={() =>
							onUpdateGlobal({ rolloutId, percent: globalPercent })
						}
						disabled={globalPercent === entry.percent}
						className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded disabled:opacity-40"
					>
						Save
					</button>
				</div>
			</div>

			{expanded && (
				<div className="p-4 flex flex-col gap-3">
					<div className="text-[10px] text-t3">
						prev: {entry.previousPercent}% | changed:{" "}
						{formatTimestamp(entry.changedAt)}
					</div>

					<div className="flex items-center justify-between">
						<h4 className="text-xs font-medium text-t2">Org Overrides</h4>
						<button
							type="button"
							onClick={() => onAddOrg({ rolloutId })}
							className="flex items-center gap-1 text-xs text-primary hover:underline"
						>
							<Plus className="w-3 h-3" />
							Add Org
						</button>
					</div>

					{orgEntries.length === 0 && (
						<p className="text-xs text-t3 italic">
							No org overrides. Global percent applies to all.
						</p>
					)}

					<div className="flex flex-col gap-2">
						{orgEntries.map(([orgId, orgEntry]) => (
							<RolloutOrgRow
								key={orgId}
								rolloutId={rolloutId}
								orgId={orgId}
								orgEntry={orgEntry}
								onUpdate={onUpdateOrg}
								onDelete={onDeleteOrg}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export const EdgeConfigView = () => {
	const navigate = useNavigate();
	const { isAdmin, isPending } = useAdmin();
	const axiosInstance = useAxiosInstance();

	const { data, isLoading, refetch } = useQuery<RolloutsResponse>({
		queryKey: ["admin-rollouts"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/rollouts");
			return data;
		},
	});

	const updateGlobalMutation = useMutation({
		mutationFn: async ({
			rolloutId,
			percent,
		}: { rolloutId: string; percent: number }) => {
			await axiosInstance.put(`/admin/rollouts/${rolloutId}`, { percent });
		},
		onSuccess: () => {
			toast.success("Global rollout updated");
			refetch();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update rollout")),
	});

	const updateOrgMutation = useMutation({
		mutationFn: async ({
			rolloutId,
			orgId,
			percent,
		}: { rolloutId: string; orgId: string; percent: number }) => {
			await axiosInstance.put(
				`/admin/rollouts/${rolloutId}/orgs/${orgId}`,
				{ percent },
			);
		},
		onSuccess: () => {
			toast.success("Org override updated");
			refetch();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update org override")),
	});

	const deleteOrgMutation = useMutation({
		mutationFn: async ({
			rolloutId,
			orgId,
		}: { rolloutId: string; orgId: string }) => {
			await axiosInstance.delete(
				`/admin/rollouts/${rolloutId}/orgs/${orgId}`,
			);
		},
		onSuccess: () => {
			toast.success("Org override removed");
			refetch();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to remove org override")),
	});

	const handleAddOrg = ({ rolloutId }: { rolloutId: string }) => {
		const orgId = prompt("Enter org ID:");
		if (!orgId?.trim()) return;

		const percentStr = prompt("Enter rollout percentage (0-100):", "0");
		const percent = Number(percentStr);
		if (Number.isNaN(percent) || percent < 0 || percent > 100) {
			toast.error("Invalid percentage");
			return;
		}

		updateOrgMutation.mutate({ rolloutId, orgId: orgId.trim(), percent });
	};

	const handleDeleteOrg = ({
		rolloutId,
		orgId,
	}: { rolloutId: string; orgId: string }) => {
		if (!confirm(`Remove org override for ${orgId}?`)) return;
		deleteOrgMutation.mutate({ rolloutId, orgId });
	};

	if (isPending || isLoading) {
		return (
			<div className="h-screen w-screen">
				<LoadingScreen />
			</div>
		);
	}

	if (!isAdmin) return <DefaultView />;

	const rollouts = data?.rollouts ?? {};
	const rolloutEntries = Object.entries(rollouts);

	return (
		<div className="flex flex-col p-6 gap-6 max-w-4xl mx-auto">
			<div className="flex items-center gap-3">
				<IconButton
					icon={<ArrowLeft className="w-4 h-4" />}
					variant="ghost"
					size="sm"
					onClick={() => navigate("/admin")}
				/>
				<h1 className="text-lg font-semibold">Rollout Edge Config</h1>
				<div className="flex-1" />
				<IconButton
					icon={<RefreshCw className="w-4 h-4" />}
					variant="ghost"
					size="sm"
					onClick={() => refetch()}
				/>
				{data && (
					<span className="text-[10px] text-t3">
						{data.configHealthy ? "Healthy" : "Unhealthy"} | Last sync:{" "}
						{data.lastSuccessAt ?? "never"}
					</span>
				)}
			</div>

			{rolloutEntries.length === 0 && (
				<p className="text-sm text-t3 italic">
					No rollouts configured. Add a rollout entry to the S3 config to get
					started.
				</p>
			)}

			<div className="flex flex-col gap-4">
				{rolloutEntries.map(([rolloutId, entry]) => (
					<RolloutCard
						key={rolloutId}
						rolloutId={rolloutId}
						entry={entry}
						onUpdateGlobal={({ rolloutId, percent }) =>
							updateGlobalMutation.mutate({ rolloutId, percent })
						}
						onUpdateOrg={({ rolloutId, orgId, percent }) =>
							updateOrgMutation.mutate({ rolloutId, orgId, percent })
						}
						onDeleteOrg={handleDeleteOrg}
						onAddOrg={handleAddOrg}
					/>
				))}
			</div>
		</div>
	);
};
