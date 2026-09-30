import { Button, IconButton, PageContainer, PageHeader } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Plus, RefreshCw, RotateCcw, Sliders } from "lucide-react";
import { useState } from "react";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";
import { RolloutConfirmDialog } from "./RolloutConfirmDialog";
import { RolloutCustomerList } from "./RolloutCustomerList";
import { RolloutCustomersDialog } from "./RolloutCustomersDialog";
import { RolloutGlobalControl } from "./RolloutGlobalControl";
import { RolloutOrgDialog } from "./RolloutOrgDialog";
import { RolloutOrgList } from "./RolloutOrgList";
import { RolloutSection } from "./RolloutSection";
import { useBalanceWorkerRollout } from "./useBalanceWorkerRollout";

/** The one dialog open at a time, with what it acts on. */
type RolloutDialog =
	| { kind: "addOrg" }
	| { kind: "removeOrg"; orgId: string; name: string }
	| { kind: "resetOrgs" }
	| { kind: "addCustomers" }
	| { kind: "removeCustomer"; orgId: string; customerId: string };

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

/** The balance-worker rollout: one global percent, per-org and per-customer overrides, and where each change stands. */
export const EdgeConfigView = () => {
	const { isAdmin, isPending } = useAdmin();
	const rollout = useBalanceWorkerRollout();
	const [dialog, setDialog] = useState<RolloutDialog>();
	const closeDialog = () => setDialog(undefined);

	if (isPending || rollout.isLoading) {
		return (
			<div className="h-dvh w-screen">
				<LoadingScreen />
			</div>
		);
	}
	if (!isAdmin) return <DefaultView />;

	const {
		global,
		orgOverrides,
		customerPins,
		orgsById,
		customerNamesByOrgId,
		settleMs,
		health,
	} = rollout;
	const settleSeconds = Math.round(settleMs / 1_000);
	const activeOrgCount = orgOverrides.filter(
		([, { percent }]) => percent > 0,
	).length;
	const removingOrg = dialog?.kind === "removeOrg" ? dialog : undefined;
	const removingCustomer =
		dialog?.kind === "removeCustomer" ? dialog : undefined;
	const removingCustomerName = removingCustomer
		? (customerNamesByOrgId[removingCustomer.orgId]?.[
				removingCustomer.customerId
			]?.name ?? removingCustomer.customerId)
		: "This customer";

	return (
		<PageContainer className="gap-6">
			<RolloutOrgDialog
				open={dialog?.kind === "addOrg"}
				onOpenChange={(open) => !open && closeDialog()}
				onSubmit={({ orgId, percent }) =>
					rollout.setOrgPercent.mutate(
						{ orgId, percent },
						{ onSuccess: closeDialog },
					)
				}
				isSaving={rollout.setOrgPercent.isPending}
			/>
			<RolloutConfirmDialog
				open={Boolean(removingOrg)}
				onOpenChange={(open) => !open && closeDialog()}
				title="Remove override"
				description={`${removingOrg?.name ?? "This org"} will follow the global percent (${global.percent}%) ${settleSeconds}s after removal.`}
				confirmLabel="Remove override"
				onConfirm={() =>
					removingOrg &&
					rollout.removeOrg.mutate(
						{ orgId: removingOrg.orgId },
						{ onSuccess: closeDialog },
					)
				}
				isPending={rollout.removeOrg.isPending}
			/>
			<RolloutConfirmDialog
				open={dialog?.kind === "resetOrgs"}
				onOpenChange={(open) => !open && closeDialog()}
				title="Reset all org overrides to 0%"
				description={`${activeOrgCount} org ${activeOrgCount === 1 ? "override drops" : "overrides drop"} to 0% ${settleSeconds}s after you confirm, sending those orgs back to the legacy path. The overrides stay listed at 0%; the global percent and customer overrides are not changed.`}
				confirmLabel="Reset all to 0%"
				onConfirm={() =>
					rollout.resetOrgs.mutate(undefined, { onSuccess: closeDialog })
				}
				isPending={rollout.resetOrgs.isPending}
			/>
			<RolloutCustomersDialog
				open={dialog?.kind === "addCustomers"}
				onOpenChange={(open) => !open && closeDialog()}
				onSubmit={(input) =>
					rollout.addCustomers.mutate(input, { onSuccess: closeDialog })
				}
				isSaving={rollout.addCustomers.isPending}
				settleSeconds={settleSeconds}
			/>
			<RolloutConfirmDialog
				open={Boolean(removingCustomer)}
				onOpenChange={(open) => !open && closeDialog()}
				title="Remove customer"
				description={`${removingCustomerName} will follow its org's percent ${settleSeconds}s after removal.`}
				confirmLabel="Remove customer"
				onConfirm={() =>
					removingCustomer &&
					rollout.removeCustomer.mutate(
						{
							orgId: removingCustomer.orgId,
							customerId: removingCustomer.customerId,
						},
						{ onSuccess: closeDialog },
					)
				}
				isPending={rollout.removeCustomer.isPending}
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

			<RolloutSection
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
			</RolloutSection>

			<RolloutSection
				title="Org overrides"
				description="An org with an override ignores the global percent until the override is removed."
				actions={
					<>
						{orgOverrides.length > 0 && (
							<Button
								size="sm"
								variant="secondary"
								onClick={() => setDialog({ kind: "resetOrgs" })}
								disabled={activeOrgCount === 0}
							>
								<RotateCcw className="size-3.5" />
								Reset all to 0%
							</Button>
						)}
						<Button
							size="sm"
							variant="secondary"
							onClick={() => setDialog({ kind: "addOrg" })}
						>
							<Plus className="size-3.5" />
							Add org
						</Button>
					</>
				}
			>
				<RolloutOrgList
					orgOverrides={orgOverrides}
					orgsById={orgsById}
					settleMs={settleMs}
					onApply={({ orgId, percent }) =>
						rollout.setOrgPercent.mutate({ orgId, percent })
					}
					onRemove={({ orgId, name }) =>
						setDialog({ kind: "removeOrg", orgId, name })
					}
					isSaving={rollout.setOrgPercent.isPending}
				/>
			</RolloutSection>

			<RolloutSection
				title="Customer overrides"
				description="A listed customer is on the worker whatever its org's percent, until it is removed."
				actions={
					<Button
						size="sm"
						variant="secondary"
						onClick={() => setDialog({ kind: "addCustomers" })}
					>
						<Plus className="size-3.5" />
						Add customers
					</Button>
				}
			>
				<RolloutCustomerList
					customerPins={customerPins}
					orgsById={orgsById}
					customerNamesByOrgId={customerNamesByOrgId}
					settleMs={settleMs}
					onRemove={({ orgId, customerId }) =>
						setDialog({ kind: "removeCustomer", orgId, customerId })
					}
				/>
			</RolloutSection>
		</PageContainer>
	);
};
