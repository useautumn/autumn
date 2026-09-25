import { Button, IconButton, PageContainer, PageHeader } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Plus, RefreshCw, Sliders } from "lucide-react";
import { useState } from "react";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { SettingsSection } from "../../settings/SettingsSection";
import { useAdmin } from "../hooks/useAdmin";
import { RolloutConfirmDialog } from "./RolloutConfirmDialog";
import { RolloutGlobalControl } from "./RolloutGlobalControl";
import { RolloutOrgDialog } from "./RolloutOrgDialog";
import { ORG_ROW_GRID, RolloutOrgRow } from "./RolloutOrgRow";
import { useBalanceWorkerRollout } from "./useBalanceWorkerRollout";

type PendingRemoval = { orgId: string; name: string };

const ConfigHealth = ({ healthy }: { healthy: boolean }) => (
	<span className="flex items-center gap-2 px-2 text-tiny text-subtle">
		{healthy ? "Config synced" : "Config unhealthy"}
		<span
			className={cn(
				"inline-flex size-2 rounded-full",
				healthy ? "bg-green-500" : "bg-red-500",
			)}
		/>
	</span>
);

/** The balance-worker rollout: one global percent, per-org overrides, and where each change stands. */
export const EdgeConfigView = () => {
	const { isAdmin, isPending } = useAdmin();
	const rollout = useBalanceWorkerRollout();
	const [addingOrg, setAddingOrg] = useState(false);
	const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>();

	if (isPending || rollout.isLoading) {
		return (
			<div className="h-dvh w-screen">
				<LoadingScreen />
			</div>
		);
	}
	if (!isAdmin) return <DefaultView />;

	const { global, orgOverrides, orgsById, settleMs, health } = rollout;
	const settleSeconds = Math.round(settleMs / 1_000);

	return (
		<PageContainer className="gap-8">
			<RolloutOrgDialog
				open={addingOrg}
				onOpenChange={setAddingOrg}
				onSubmit={({ orgId, percent }) =>
					rollout.setOrgPercent.mutate(
						{ orgId, percent },
						{ onSuccess: () => setAddingOrg(false) },
					)
				}
				isSaving={rollout.setOrgPercent.isPending}
			/>
			<RolloutConfirmDialog
				open={Boolean(pendingRemoval)}
				onOpenChange={(open) => !open && setPendingRemoval(undefined)}
				title="Remove override"
				description={`${pendingRemoval?.name ?? "This org"} will follow the global percent (${global.percent}%) ${settleSeconds}s after removal.`}
				confirmLabel="Remove override"
				onConfirm={() =>
					pendingRemoval &&
					rollout.removeOrg.mutate(
						{ orgId: pendingRemoval.orgId },
						{ onSuccess: () => setPendingRemoval(undefined) },
					)
				}
				isPending={rollout.removeOrg.isPending}
			/>

			<PageHeader
				icon={<Sliders className="size-4 text-subtle" />}
				title="Balance worker rollout"
			>
				{health && <ConfigHealth healthy={health.healthy} />}
				<IconButton
					icon={<RefreshCw className="size-3.5" />}
					variant="secondary"
					size="sm"
					onClick={() => void rollout.refresh()}
					aria-label="Refresh"
				/>
			</PageHeader>

			<SettingsSection
				title="Global"
				description={`Every org without an override. A change lands ${settleSeconds}s after you apply it, on every server at once.`}
			>
				<RolloutGlobalControl
					rollout={global}
					settleMs={settleMs}
					onApply={({ percent }) =>
						rollout.setGlobalPercent.mutate({ percent })
					}
					isSaving={rollout.setGlobalPercent.isPending}
				/>
			</SettingsSection>

			<SettingsSection
				title="Org overrides"
				description="An org with an override ignores the global percent until the override is removed."
				actions={
					<Button
						size="sm"
						variant="secondary"
						onClick={() => setAddingOrg(true)}
					>
						<Plus className="size-3.5" />
						Add org
					</Button>
				}
			>
				<div className="divide-y overflow-clip rounded-lg border bg-interactive-secondary">
					{orgOverrides.length === 0 ? (
						<div className="flex h-12 items-center px-4 text-sm text-tertiary-foreground">
							No overrides. Every org follows the global percent.
						</div>
					) : (
						<>
							<div
								className={`h-9 text-tiny uppercase tracking-wide text-subtle ${ORG_ROW_GRID}`}
							>
								<span>Org</span>
								<span>On the worker</span>
								<span>Status</span>
								<span />
							</div>
							{orgOverrides.map(([orgId, orgRollout]) => (
								<RolloutOrgRow
									key={orgId}
									orgId={orgId}
									org={orgsById[orgId]}
									rollout={orgRollout}
									settleMs={settleMs}
									onApply={({ percent }) =>
										rollout.setOrgPercent.mutate({ orgId, percent })
									}
									onRemove={() =>
										setPendingRemoval({
											orgId,
											name: orgsById[orgId]?.name ?? orgId,
										})
									}
									isSaving={rollout.setOrgPercent.isPending}
								/>
							))}
						</>
					)}
				</div>
			</SettingsSection>
		</PageContainer>
	);
};
