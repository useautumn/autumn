import {
	cusEntsToGrantedBalance,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getCusEntBalance,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCustomerContext } from "../../customer/CustomerContext";

export function BalanceEditSheet() {
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const {
		featureId,
		originalEntitlements,
		selectedCusEntId,
		closeSheet: closeBalanceSheet,
	} = useCustomerBalanceSheetStore();
	const closeSheet = useSheetStore((s) => s.closeSheet);

	const axiosInstance = useAxiosInstance();
	const [updateLoading, setUpdateLoading] = useState(false);

	const hasMultipleBalances = originalEntitlements.length > 1;

	// Get the selected entitlement
	const selectedCusEnt = originalEntitlements.find(
		(ent) => ent.id === selectedCusEntId,
	);

	// Get the initial fields for the selected entitlement
	const initialFields = useMemo(() => {
		if (!selectedCusEnt) {
			return {
				balance: null as number | null,
				next_reset_at: null as number | null,
			};
		}

		const balanceFields = getCusEntBalance({
			cusEnt: selectedCusEnt,
			entityId,
		});

		const balance = balanceFields.balance;
		const grantedBalance = cusEntsToGrantedBalance({
			cusEnts: [selectedCusEnt],
			entityId: entityId ?? undefined,
		});

		const rolloverBalance = selectedCusEnt.rollovers.reduce(
			(acc, rollover) => acc + rollover.balance,
			0,
		);

		return {
			balance: balance !== null ? balance + rolloverBalance : null,
			next_reset_at: selectedCusEnt.next_reset_at,
		};
	}, [selectedCusEnt, entityId]);

	const [updateFields, setUpdateFields] = useState(initialFields);

	// Reset fields when selected entitlement changes
	useEffect(() => {
		setUpdateFields(initialFields);
	}, [initialFields]);

	const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
		const cusProduct = customer?.customer_products.find(
			(cp: FullCusProduct) => cp.id === cusEnt.customer_product_id,
		);
		return cusProduct;
	};

	const handleClose = () => {
		closeBalanceSheet();
		closeSheet();
	};

	const handleUpdateCusEntitlement = async (
		cusEnt: FullCustomerEntitlement,
	) => {
		const balanceInt = parseFloat(String(updateFields.balance));
		if (Number.isNaN(balanceInt)) {
			toast.error("Balance not valid");
			return;
		}

		const cusProduct = getCusProduct(cusEnt);
		const cusPrice = cusProduct?.customer_prices.find(
			(cp: FullCustomerPrice) =>
				cp.price.entitlement_id === cusEnt.entitlement.id,
		);

		if (cusPrice && updateFields.next_reset_at !== cusEnt.next_reset_at) {
			toast.error("Not allowed to change reset at for paid features");
			return;
		}

		setUpdateLoading(true);

		try {
			await CusService.updateCusEntitlement(
				axiosInstance,
				customer.id || customer.internal_id,
				cusEnt.id,
				{
					balance: balanceInt,
					next_reset_at: updateFields.next_reset_at,
					entity_id: entityId,
				},
			);
			toast.success("Balance updated successfully");
			await refetch();
			handleClose();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update entitlement"));
		}
		setUpdateLoading(false);
	};

	if (!featureId || !originalEntitlements.length) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="Edit Balance"
					description="Loading balance information..."
				/>
			</div>
		);
	}

	const firstEnt = originalEntitlements[0];
	const feature = firstEnt.entitlement.feature;

	const isUnlimited = selectedCusEnt
		? isUnlimitedCusEnt({ cusEnt: selectedCusEnt })
		: false;

	if (!selectedCusEnt) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Edit Balance" description="No balance selected" />
			</div>
		);
	}

	console.log("selectedCusEnt", selectedCusEnt);

	const fields = updateFields;
	if (!fields) return null;

	const cusProduct = getCusProduct(selectedCusEnt);
	const cusPrice = cusProduct?.customer_prices.find(
		(cp: FullCustomerPrice) =>
			cp.price.entitlement_id === selectedCusEnt.entitlement.id,
	);

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title={feature.name}
				description={
					<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
						{feature.id}
					</CopyButton>
				}
				breadcrumbs={
					hasMultipleBalances
						? [
								{
									name: "Balance List",
									sheet: "balance-selection",
								},
							]
						: undefined
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<SheetSection withSeparator>
					<div className="flex flex-col gap-2 rounded-lg">
						{cusProduct?.entity_id && (
							<InfoRow
								label="Entity"
								value={cusProduct.entity_name || cusProduct.entity_id}
							/>
						)}
						<div>
							<InfoRow label="Plan" value={cusProduct?.product.name || "N/A"} />
						</div>

						<InfoRow
							label="Interval"
							value={
								<span className="bg-muted px-1 py-0.5 rounded-md text-t3">
									{selectedCusEnt.entitlement.interval === "lifetime"
										? "never"
										: selectedCusEnt.entitlement.interval}
								</span>
							}
						/>
						{isUnlimited && (
							<InfoRow
								label="Balance"
								value={
									<span className="bg-muted px-1 py-0.5 rounded-md text-t3">
										Unlimited
									</span>
								}
							/>
						)}
					</div>
				</SheetSection>

				{!isUnlimited && (
					<SheetSection withSeparator={false}>
						<div className="flex flex-col gap-3">
							<div className="flex gap-3">
								<div className="flex items-end gap-2 border border-blue-500">
									<LabelInput
										label="Balance"
										placeholder="Enter balance"
										type="number"
										className="flex-1"
										value={
											notNullish(fields.balance) ? String(fields.balance) : ""
										}
										onChange={(e) => {
											setUpdateFields({
												...updateFields,
												balance: e.target.value
													? parseFloat(e.target.value)
													: null,
											});
										}}
									/>
									<div className="text-t4 text-xs flex items-end">/ </div>
								</div>
								<div className="flex-1">
									<div className="text-form-label block mb-1">Next Reset</div>
									<DateInputUnix
										disabled={!!cusPrice}
										unixDate={fields.next_reset_at}
										setUnixDate={(unixDate) => {
											setUpdateFields({
												...updateFields,
												next_reset_at: unixDate,
											});
										}}
									/>
								</div>
							</div>

							{cusPrice && (
								<InfoBox classNames={{ infoBox: "text-sm p-2" }}>
									Reset cycle cannot be changed for paid features, as it follows
									the billing cycle.
								</InfoBox>
							)}
						</div>
						<Button
							variant="primary"
							className="w-full mt-3"
							isLoading={updateLoading}
							onClick={() => handleUpdateCusEntitlement(selectedCusEnt)}
						>
							Update Balance
						</Button>
					</SheetSection>
				)}

				{/* <Button variant="secondary" onClick={handleClose}>
					Cancel
				</Button> */}
			</div>
		</div>
	);
}
