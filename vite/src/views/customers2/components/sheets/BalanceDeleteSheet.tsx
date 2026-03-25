import {
	cusEntsToBalance,
	type Entity,
	type FullCusEntWithFullCusProduct,
	fullCustomerToCustomerEntitlements,
	numberWithCommas,
} from "@autumn/shared";
import {
	MinusCircleIcon,
	ShieldCheckIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
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
				<div className="p-4 text-sm text-t3">Loading...</div>
			</div>
		);
	}

	const remainingBalance = getCustomerBalanceRemaining({
		balance,
		entityId,
	});
	const balanceId = balance.external_id ?? null;

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
		otherRemainingBalance > 0 && remainingBalance > 0;

	const handleClose = () => {
		setDeleteMode("keep");
		closeSheet();
	};

	const handleDelete = async () => {
		const customerId = customer.id || customer.internal_id;
		if (!customerId) return;

		setIsDeleting(true);
		try {
			await axiosInstance.post("/v1/balances.delete", {
				...getDeleteBalanceParams({
					balance,
					customerId,
					entityId,
				}),
				recalculate_balances:
					canDeductFromOtherBalances && deleteMode === "deduct",
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

				{!canDeductFromOtherBalances && (
					<SheetSection withSeparator={false}>
						<p className="text-sm text-t3">
							{balanceId ? (
								<>
									Deleting the{" "}
									<span className="text-tiny-id bg-muted px-1.5 py-0.5 rounded-md text-t2">
										{balanceId}
									</span>{" "}
									balance
								</>
							) : (
								"Deleting this balance"
							)}
							{" with "}
							{numberWithCommas(remainingBalance)} remaining{" "}
							{balance.entitlement.feature.name}.
						</p>
					</SheetSection>
				)}

				{canDeductFromOtherBalances && (
					<SheetSection
						title="Usage Handling"
						description={
							<>
								{balanceId ? (
									<>
										Deleting the{" "}
										<span className="text-tiny-id bg-muted px-1.5 py-0.5 rounded-md text-t2">
											{balanceId}
										</span>{" "}
										balance
									</>
								) : (
									"Deleting this balance"
								)}
								{" with "}
								{numberWithCommas(remainingBalance)} remaining{" "}
								{balance.entitlement.feature.name}.
							</>
						}
						withSeparator={false}
					>
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
										Delete this balance only. The remaining{" "}
										{numberWithCommas(remainingBalance)} will not be deducted
										elsewhere.
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
										{numberWithCommas(remainingBalance)} from the customer's
										other balances for this feature.
									</div>
								</div>
							</div>
						</div>
					</SheetSection>
				)}

				<div className="px-4 pb-2">
					<InfoBox variant="warning" classNames={{ infoBox: "w-full" }}>
						This action cannot be undone.
					</InfoBox>
				</div>

				<SheetFooter>
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
