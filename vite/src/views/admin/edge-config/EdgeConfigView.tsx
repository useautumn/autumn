import { Button, IconButton, PageContainer, PageHeader } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { Plus, RefreshCw, Sliders } from "lucide-react";
import { useState } from "react";
import { DefaultView } from "../../DefaultView";
import LoadingScreen from "../../general/LoadingScreen";
import { useAdmin } from "../hooks/useAdmin";
import { RolloutConfirmDialog } from "./RolloutConfirmDialog";
import { CUSTOMER_ROW_GRID, RolloutCustomerRow } from "./RolloutCustomerRow";
import { RolloutCustomersDialog } from "./RolloutCustomersDialog";
import { RolloutGlobalControl } from "./RolloutGlobalControl";
import { RolloutOrgDialog } from "./RolloutOrgDialog";
import { ORG_ROW_GRID, RolloutOrgRow } from "./RolloutOrgRow";
import { RolloutSection } from "./RolloutSection";
import { useBalanceWorkerRollout } from "./useBalanceWorkerRollout";

type PendingRemoval = { orgId: string; name: string };
type PendingCustomerRemoval = { orgId: string; customerId: string };

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
	const [addingCustomers, setAddingCustomers] = useState(false);
	const [pendingCustomerRemoval, setPendingCustomerRemoval] =
		useState<PendingCustomerRemoval>();

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
	const pendingCustomerRemovalName = pendingCustomerRemoval
		? (customerNamesByOrgId[pendingCustomerRemoval.orgId]?.[
				pendingCustomerRemoval.customerId
			]?.name ?? pendingCustomerRemoval.customerId)
		: undefined;

	return (
		<PageContainer className="gap-6">
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
			<RolloutCustomersDialog
				open={addingCustomers}
				onOpenChange={setAddingCustomers}
				onSubmit={(input) =>
					rollout.addCustomers.mutate(input, {
						onSuccess: () => setAddingCustomers(false),
					})
				}
				isSaving={rollout.addCustomers.isPending}
				settleSeconds={settleSeconds}
			/>
			<RolloutConfirmDialog
				open={Boolean(pendingCustomerRemoval)}
				onOpenChange={(open) => !open && setPendingCustomerRemoval(undefined)}
				title="Remove customer"
				description={`${pendingCustomerRemovalName ?? "This customer"} will follow its org's percent ${settleSeconds}s after removal.`}
				confirmLabel="Remove customer"
				onConfirm={() =>
					pendingCustomerRemoval &&
					rollout.removeCustomer.mutate(pendingCustomerRemoval, {
						onSuccess: () => setPendingCustomerRemoval(undefined),
					})
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
			</RolloutSection>

			<RolloutSection
				title="Customer overrides"
				description="A listed customer is on the worker whatever its org's percent, until it is removed."
				actions={
					<Button
						size="sm"
						variant="secondary"
						onClick={() => setAddingCustomers(true)}
					>
						<Plus className="size-3.5" />
						Add customers
					</Button>
				}
			>
				<div className="divide-y overflow-clip rounded-lg border bg-interactive-secondary">
					{customerPins.length === 0 ? (
						<div className="flex h-12 items-center px-4 text-sm text-tertiary-foreground">
							No customer overrides.
						</div>
					) : (
						<>
							<div
								className={`h-9 text-tiny uppercase tracking-wide text-subtle ${CUSTOMER_ROW_GRID}`}
							>
								<span>Org</span>
								<span>Customer</span>
								<span>Status</span>
								<span />
							</div>
							{customerPins.map(({ orgId, customerId, customer }) => (
								<RolloutCustomerRow
									key={`${orgId}:${customerId}`}
									orgId={orgId}
									org={orgsById[orgId]}
									customerId={customerId}
									customerName={customerNamesByOrgId[orgId]?.[customerId]}
									customer={customer}
									settleMs={settleMs}
									onRemove={() =>
										setPendingCustomerRemoval({ orgId, customerId })
									}
								/>
							))}
						</>
					)}
				</div>
			</RolloutSection>
		</PageContainer>
	);
};
