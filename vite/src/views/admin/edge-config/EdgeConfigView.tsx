import { AppEnv } from "@autumn/shared";
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
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { Input } from "@/components/v2/inputs/Input";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";
import { RolloutCreateDialog } from "./RolloutCreateDialog";
import { RolloutOrgDialog } from "./RolloutOrgDialog";

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

type EdgeConfigSource = {
	bucket: string;
	region: string;
	configs: {
		id: string;
		label: string;
		key: string;
	}[];
};

const formatTimestamp = (timestamp: number) => {
	if (!timestamp) return "Never";
	return new Date(timestamp).toLocaleString();
};

const formatPercent = (percent: number) => `${percent}%`;

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
	}: {
		rolloutId: string;
		orgId: string;
		percent: number;
	}) => void;
	onDelete: ({
		rolloutId,
		orgId,
	}: {
		rolloutId: string;
		orgId: string;
	}) => void;
}) => {
	const [editPercent, setEditPercent] = useState(orgEntry.percent);

	return (
		<div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center">
			<div className="min-w-0">
				<p className="truncate font-mono text-xs text-foreground">{orgId}</p>
				<p className="mt-1 text-[11px] text-muted-foreground">
					prev: {formatPercent(orgEntry.previousPercent)} | changed:{" "}
					{formatTimestamp(orgEntry.changedAt)}
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Input
					type="number"
					min={0}
					max={100}
					value={editPercent}
					onChange={(event) => setEditPercent(Number(event.target.value))}
					className="h-9"
				/>
				<span className="text-xs text-muted-foreground">%</span>
			</div>

			<div className="flex items-center gap-2 justify-self-start md:justify-self-end">
				<Button
					size="sm"
					onClick={() => onUpdate({ rolloutId, orgId, percent: editPercent })}
					disabled={editPercent === orgEntry.percent}
				>
					Save
				</Button>
				<IconButton
					icon={<Trash2 className="w-3.5 h-3.5" />}
					variant="secondary"
					size="sm"
					onClick={() => onDelete({ rolloutId, orgId })}
				/>
			</div>
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
	}: {
		rolloutId: string;
		percent: number;
	}) => void;
	onUpdateOrg: ({
		rolloutId,
		orgId,
		percent,
	}: {
		rolloutId: string;
		orgId: string;
		percent: number;
	}) => void;
	onDeleteOrg: ({
		rolloutId,
		orgId,
	}: {
		rolloutId: string;
		orgId: string;
	}) => void;
	onAddOrg: ({ rolloutId }: { rolloutId: string }) => void;
}) => {
	const [expanded, setExpanded] = useState(true);
	const [globalPercent, setGlobalPercent] = useState(entry.percent);

	const orgEntries = Object.entries(entry.orgs);
	const globalPercentInputId = `rollout-global-percent-${rolloutId}`;

	return (
		<Card className="gap-0 overflow-hidden py-0">
			<CardHeader className="border-b bg-muted/30 py-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex items-start gap-3">
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="mt-1 text-muted-foreground transition-colors hover:text-foreground"
						>
							{expanded ? (
								<ChevronDown className="w-4 h-4" />
							) : (
								<ChevronRight className="w-4 h-4" />
							)}
						</button>
						<div className="min-w-0">
							<CardTitle className="font-mono text-sm">{rolloutId}</CardTitle>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<Badge variant="muted">
									Global {formatPercent(entry.percent)}
								</Badge>
								<Badge variant="muted">
									{orgEntries.length} org override
									{orgEntries.length === 1 ? "" : "s"}
								</Badge>
								<span className="text-[11px] text-muted-foreground">
									prev: {formatPercent(entry.previousPercent)} | changed:{" "}
									{formatTimestamp(entry.changedAt)}
								</span>
							</div>
						</div>
					</div>

					<div className="flex items-end gap-2 lg:min-w-[240px]">
						<div className="flex-1">
							<label
								htmlFor={globalPercentInputId}
								className="mb-1 block text-[11px] font-medium text-muted-foreground"
							>
								Global Percent
							</label>
							<Input
								id={globalPercentInputId}
								type="number"
								min={0}
								max={100}
								value={globalPercent}
								onChange={(event) =>
									setGlobalPercent(Number(event.target.value))
								}
								className="h-9"
							/>
						</div>
						<Button
							size="sm"
							onClick={() =>
								onUpdateGlobal({ rolloutId, percent: globalPercent })
							}
							disabled={globalPercent === entry.percent}
						>
							Save
						</Button>
					</div>
				</div>
			</CardHeader>

			{expanded && (
				<CardContent className="flex flex-col gap-4 py-4">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h4 className="text-sm font-medium text-foreground">
								Org Overrides
							</h4>
							<p className="text-xs text-muted-foreground">
								Override the rollout percentage for specific organizations.
							</p>
						</div>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={() => onAddOrg({ rolloutId })}
						>
							<Plus className="w-3 h-3" />
							Add Org
						</Button>
					</div>

					{orgEntries.length === 0 && (
						<div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-6 text-center">
							<p className="text-sm text-muted-foreground">
								No org overrides yet.
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Global rollout percentage applies to every org until you add an
								override.
							</p>
						</div>
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
				</CardContent>
			)}
		</Card>
	);
};

export const EdgeConfigView = () => {
	const navigate = useNavigate();
	const env = useEnv();
	const { isAdmin, isPending } = useAdmin();
	const axiosInstance = useAxiosInstance();
	const adminBasePath = env === AppEnv.Sandbox ? "/sandbox/admin" : "/admin";
	const [addOrgRolloutId, setAddOrgRolloutId] = useState<string>();
	const [createRolloutOpen, setCreateRolloutOpen] = useState(false);

	const { data, isLoading, refetch } = useQuery<RolloutsResponse>({
		queryKey: ["admin-rollouts"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/rollouts");
			return data;
		},
	});
	const { data: source } = useQuery<EdgeConfigSource>({
		queryKey: ["admin-edge-config-sources"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/edge-config-sources");
			return data;
		},
	});

	const updateGlobalMutation = useMutation({
		mutationFn: async ({
			rolloutId,
			percent,
		}: {
			rolloutId: string;
			percent: number;
		}) => {
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
		}: {
			rolloutId: string;
			orgId: string;
			percent: number;
		}) => {
			await axiosInstance.put(`/admin/rollouts/${rolloutId}/orgs/${orgId}`, {
				percent,
			});
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
		}: {
			rolloutId: string;
			orgId: string;
		}) => {
			await axiosInstance.delete(`/admin/rollouts/${rolloutId}/orgs/${orgId}`);
		},
		onSuccess: () => {
			toast.success("Org override removed");
			refetch();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to remove org override")),
	});

	const handleDeleteOrg = ({
		rolloutId,
		orgId,
	}: {
		rolloutId: string;
		orgId: string;
	}) => {
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
	const rolloutSource = source?.configs.find((config) => config.id === "rollouts");

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
			<RolloutOrgDialog
				open={Boolean(addOrgRolloutId)}
				onOpenChange={(open) => {
					if (!open) {
						setAddOrgRolloutId(undefined);
					}
				}}
				rolloutId={addOrgRolloutId}
				onSubmit={({ rolloutId, orgId, percent }) =>
					updateOrgMutation.mutate({ rolloutId, orgId, percent })
				}
				isSaving={updateOrgMutation.isPending}
			/>
			<RolloutCreateDialog
				open={createRolloutOpen}
				onOpenChange={setCreateRolloutOpen}
				onSubmit={({ rolloutId, percent }) =>
					updateGlobalMutation.mutate(
						{ rolloutId, percent },
						{
							onSuccess: () => {
								setCreateRolloutOpen(false);
							},
						},
					)
				}
				isSaving={updateGlobalMutation.isPending}
			/>

			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<IconButton
						icon={<ArrowLeft className="w-4 h-4" />}
						variant="secondary"
						size="sm"
						onClick={() => navigate(adminBasePath)}
					/>
					<div>
						<h1 className="text-lg font-semibold text-foreground">
							Rollout Edge Config
						</h1>
						<p className="text-sm text-muted-foreground">
							Manage global rollout percentages and per-org overrides.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{data && (
						<Badge variant="muted" className="h-7 px-2 text-xs">
							{data.configHealthy ? "Healthy" : "Unhealthy"} | Last sync:{" "}
							{data.lastSuccessAt ?? "never"}
						</Badge>
					)}
					<IconButton
						icon={<RefreshCw className="w-4 h-4" />}
						variant="secondary"
						size="sm"
						onClick={() => refetch()}
					>
						Refresh
					</IconButton>
					<Button size="sm" onClick={() => setCreateRolloutOpen(true)}>
						<Plus className="w-4 h-4" />
						Add Rollout
					</Button>
				</div>
			</div>

			{source && rolloutSource && (
				<div className="rounded-lg border border-border bg-muted/20 p-4">
					<div className="grid gap-3 md:grid-cols-[220px_160px_minmax(0,1fr)]">
						<div>
							<div className="text-[11px] font-medium uppercase text-muted-foreground">
								S3 Bucket
							</div>
							<div className="mt-1 font-mono text-xs text-foreground">
								{source.bucket}
							</div>
						</div>
						<div>
							<div className="text-[11px] font-medium uppercase text-muted-foreground">
								Region
							</div>
							<div className="mt-1 font-mono text-xs text-foreground">
								{source.region}
							</div>
						</div>
						<div className="min-w-0">
							<div className="text-[11px] font-medium uppercase text-muted-foreground">
								Config Object
							</div>
							<div className="mt-1 font-mono text-xs text-foreground">
								{rolloutSource.key}
							</div>
						</div>
					</div>
				</div>
			)}

			{rolloutEntries.length === 0 && (
				<Card className="border-dashed">
					<CardContent className="flex flex-col items-start gap-3 py-6">
						<div>
							<h2 className="text-base font-medium text-foreground">
								No rollouts configured
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Create your first rollout entry, then add organization-specific
								overrides where needed.
							</p>
						</div>
						<Button size="sm" onClick={() => setCreateRolloutOpen(true)}>
							<Plus className="w-4 h-4" />
							Create First Rollout
						</Button>
					</CardContent>
				</Card>
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
						onAddOrg={({ rolloutId }) => setAddOrgRolloutId(rolloutId)}
					/>
				))}
			</div>
		</div>
	);
};
