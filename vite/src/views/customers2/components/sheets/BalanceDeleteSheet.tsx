import {
	cusEntsToBalance,
	cusEntsToUsage,
	type Entity,
	type FullCusEntWithFullCusProduct,
	fullCustomerToCustomerEntitlements,
	numberWithCommas,
} from "@autumn/shared";
import { Button, PanelButton } from "@autumn/ui";
import {
	MinusCircleIcon,
	ShieldCheckIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCustomerContext } from "../../customer/CustomerContext";
import {
	getCustomerBalanceRemaining,
	getDeleteBalanceParams,
} from "../table/customer-balance/customerBalanceUtils";

type DeleteMode = "keep" | "deduct";
type OverageDeleteMode = "overage" | "remove";

export function BalanceDeleteSheet() {
	const sheetData = useSheetStore((s) => s.data);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const closeBalanceSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);
	const selectedCusEntId = useCustomerBalanceSheetStore(
		(s) => s.selectedCusEntId,
	);
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const axiosInstance = useAxiosInstance();
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteMode, setDeleteMode] = useState<DeleteMode>("keep");
	const [overageDeleteSelection, setOverageDeleteSelection] = useState<{
		balanceId: string;
		mode: OverageDeleteMode;
	} | null>(null);

	const balance = sheetData?.balance as
		| FullCusEntWithFullCusProduct
		| undefined;

	if (!balance || !customer) {
		return (
			<div className="flex h-full flex-col">
				<SheetHeader
					title="Delete Balance"
					description="Loading balance details..."
				/>
				<div className="p-4 text-sm text-tertiary-foreground">Loading...</div>
			</div>
		);
	}

	const remainingBalance = getCustomerBalanceRemaining({
		balance,
		entityId,
	});
	const deletedUsage = cusEntsToUsage({
		cusEnts: [balance],
		entityId: entityId ?? undefined,
	});
	const balanceId = balance.external_id ?? null;
	const balanceLabel = balanceId ? (
		<>
			the{" "}
			<span className="text-tiny-id bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground">
				{balanceId}
			</span>{" "}
			balance
		</>
	) : (
		"this balance"
	);

	const selectedEntity =
		customer.entities?.find(
			(entity: Entity) =>
				entity.id === entityId || entity.internal_id === entityId,
		) ?? undefined;
	const otherFeatureBalances = fullCustomerToCustomerEntitlements({
		fullCustomer: customer,
		featureId: balance.entitlement.feature.id,
		entity: selectedEntity,
	}).filter((customerEntitlement) => customerEntitlement.id !== balance.id);
	const otherRemainingBalance = cusEntsToBalance({
		cusEnts: otherFeatureBalances,
		entityId: entityId ?? undefined,
		withRollovers: true,
	});
	const canDeductFromOtherBalances =
		otherRemainingBalance > 0 && deletedUsage > 0;
	const isOverageBalance = remainingBalance < 0;
	const canKeepAsOverage =
		deletedUsage > 0 && !canDeductFromOtherBalances && !isOverageBalance;
	const showUsageHandling =
		deletedUsage > 0 && (canDeductFromOtherBalances || canKeepAsOverage);
	const overageDeleteMode =
		overageDeleteSelection?.balanceId === balance.id
			? overageDeleteSelection.mode
			: "overage";

	const handleClose = () => {
		setDeleteMode("keep");
		setOverageDeleteSelection(null);
		closeSheet();
	};

	const handleDelete = async () => {
		const customerId = customer.id || customer.internal_id;
		if (!customerId) return;
		const recalculateBalances =
			(canDeductFromOtherBalances && deleteMode === "deduct") ||
			(canKeepAsOverage && overageDeleteMode === "overage");

		setIsDeleting(true);
		try {
			await axiosInstance.post("/v1/balances.delete", {
				...getDeleteBalanceParams({
					balance,
					customerId,
					entityId,
					recalculateBalances,
				}),
			});

			if (selectedCusEntId === balance.id) {
				closeBalanceSheet();
			}

			await refetch();
			handleClose();
			toast.success("Balance deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete balance"));
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title="Delete Balance"
					description="Permanently delete this balance from the customer."
				/>

				<SheetSection withSeparator={false} className="pb-0">
					<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
						This action cannot be undone.
					</InfoBox>
				</SheetSection>

				{!showUsageHandling && !isOverageBalance && (
					<SheetSection withSeparator={false}>
						<p className="text-sm text-tertiary-foreground">
							Deleting {balanceLabel}
							{" has no usage to deduct from other balances."}
						</p>
					</SheetSection>
				)}

				{isOverageBalance && (
					<SheetSection withSeparator={false}>
						<p className="text-sm text-tertiary-foreground">
							Deleting {balanceLabel}
							{" will remove its "}
							{numberWithCommas(Math.abs(remainingBalance))}{" "}
							{balance.entitlement.feature.name} overage.
						</p>
					</SheetSection>
				)}

				{showUsageHandling && (
					<SheetSection
						title="Usage Handling"
						description={
							<>
								Deleting {balanceLabel}
								{" with "}
								{numberWithCommas(remainingBalance)} remaining and{" "}
								{numberWithCommas(deletedUsage)} already used{" "}
								{balance.entitlement.feature.name}.
							</>
						}
						withSeparator={false}
					>
						{canDeductFromOtherBalances ? (
							<div className="space-y-3">
								<div className="flex w-full items-center gap-4">
									<PanelButton
										isSelected={deleteMode === "keep"}
										onClick={() => setDeleteMode("keep")}
										icon={<ShieldCheckIcon size={18} weight="duotone" />}
									/>
									<div className="flex-1">
										<div className="text-body-highlight mb-1">
											Keep other balances unchanged
										</div>
										<div className="text-body-secondary leading-tight">
											Delete this balance only. The{" "}
											{numberWithCommas(deletedUsage)} already used will not be
											deducted elsewhere.
										</div>
									</div>
								</div>

								<div className="flex w-full items-center gap-4">
									<PanelButton
										isSelected={deleteMode === "deduct"}
										onClick={() => setDeleteMode("deduct")}
										icon={<MinusCircleIcon size={18} weight="duotone" />}
									/>
									<div className="flex-1">
										<div className="text-body-highlight mb-1">
											Deduct usage from other balances
										</div>
										<div className="text-body-secondary leading-tight">
											Delete this balance and remove{" "}
											{numberWithCommas(deletedUsage)} from the customer's other
											balances for this feature.
										</div>
									</div>
								</div>
							</div>
						) : (
							<div className="space-y-3">
								<div className="flex w-full items-center gap-4">
									<PanelButton
										isSelected={overageDeleteMode === "overage"}
										onClick={() =>
											setOverageDeleteSelection({
												balanceId: balance.id,
												mode: "overage",
											})
										}
										icon={<ShieldCheckIcon size={18} weight="duotone" />}
									/>
									<div className="flex-1">
										<div className="text-body-highlight mb-1">
											Keep used amount as overage
										</div>
										<div className="text-body-secondary leading-tight">
											Delete this balance and keep the{" "}
											{numberWithCommas(deletedUsage)} already used as overage.
										</div>
									</div>
								</div>

								<div className="flex w-full items-center gap-4">
									<PanelButton
										isSelected={overageDeleteMode === "remove"}
										onClick={() =>
											setOverageDeleteSelection({
												balanceId: balance.id,
												mode: "remove",
											})
										}
										icon={<MinusCircleIcon size={18} weight="duotone" />}
									/>
									<div className="flex-1">
										<div className="text-body-highlight mb-1">
											Remove balance and usage
										</div>
										<div className="text-body-secondary leading-tight">
											Delete this balance without keeping the{" "}
											{numberWithCommas(deletedUsage)} already used as overage.
										</div>
									</div>
								</div>
							</div>
						)}
					</SheetSection>
				)}

				<SheetFooter className="pt-4">
					<Button
						variant="secondary"
						className="w-full"
						onClick={handleClose}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						className="w-full"
						onClick={handleDelete}
						isLoading={isDeleting}
					>
						<TrashIcon size={16} />
						Delete
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
