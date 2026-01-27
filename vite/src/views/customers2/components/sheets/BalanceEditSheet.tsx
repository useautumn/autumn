import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	isUnlimitedCustomerEntitlement as isUnlimitedCusEnt,
	nullish,
	numberWithCommas,
} from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCustomerContext } from "../../customer/CustomerContext";
import { BalanceEditPreviews } from "./BalanceEditPreviews";
import { GrantedBalancePopover } from "./GrantedBalancePopover";

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
	const [mode, setMode] = useState<"set" | "add">("set");
	const [addValue, setAddValue] = useState<string>("");

	const hasMultipleBalances = originalEntitlements.length > 1;
	const [_grantedBalanceChanged, setGrantedBalanceChanged] = useState(false);

	// Get the selected entitlement
	const selectedCusEnt = originalEntitlements.find(
		(ent) => ent.id === selectedCusEntId,
	);

	const prepaidAllowance = useMemo(() => {
		if (!selectedCusEnt) return 0;
		return cusEntsToPrepaidQuantity({
			cusEnts: [selectedCusEnt],
			sumAcrossEntities: nullish(entityId),
		});
	}, [selectedCusEnt]);

	// Get the initial fields for the selected entitlement
	const initialFields = useMemo(() => {
		if (!selectedCusEnt) {
			return {
				balance: null as number | null,
				next_reset_at: null as number | null,
			};
		}

		const balance = cusEntsToBalance({
			cusEnts: [selectedCusEnt],
			entityId: entityId ?? undefined,
			withRollovers: true,
		});

		const grantedBalance = cusEntsToGrantedBalance({
			cusEnts: [selectedCusEnt],
			entityId: entityId ?? undefined,
		});

		const grantedAndPurchasedBalance = grantedBalance + prepaidAllowance;

		return {
			balance: balance !== null ? balance : null,
			grantedAndPurchasedBalance:
				grantedAndPurchasedBalance !== null ? grantedAndPurchasedBalance : null,
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
		const grantedAndPurchasedBalanceFloat = parseFloat(
			String(updateFields.grantedAndPurchasedBalance),
		);
		if (Number.isNaN(balanceInt)) {
			toast.error("Please enter a valid balance");
			return;
		}

		const grantedBalanceInput =
			grantedAndPurchasedBalanceFloat - prepaidAllowance;

		const cusProduct = getCusProduct(cusEnt);
		const cusPrice = cusProduct?.customer_prices.find(
			(cp: FullCustomerPrice) =>
				cp.price.entitlement_id === cusEnt.entitlement.id,
		);

		if (cusPrice && updateFields.next_reset_at !== cusEnt.next_reset_at) {
			toast.error("Not allowed to change reset date for paid features");
			return;
		}

		setUpdateLoading(true);

		try {
			await axiosInstance.post("/v1/balances/update", {
				customer_id: customer.id || customer.internal_id,
				feature_id: featureId,
				current_balance: balanceInt,
				granted_balance: grantedBalanceInput ?? undefined,
				customer_entitlement_id: cusEnt.id,
				entity_id: entityId ?? undefined,
				next_reset_at: updateFields.next_reset_at ?? undefined,
			});
			toast.success("Balance updated successfully");
			await refetch();
			handleClose();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update entitlement"));
		}
		setUpdateLoading(false);
	};

	const handleAddToBalance = async () => {
		const valueToAdd = parseFloat(addValue);

		setUpdateLoading(true);
		try {
			await axiosInstance.post("/v1/balances/update", {
				customer_id: customer.id || customer.internal_id,
				feature_id: featureId,
				add_to_balance: valueToAdd,
				customer_entitlement_id: selectedCusEnt?.id,
				entity_id: entityId ?? undefined,
			});
			toast.success("Balance added successfully");
			await refetch();
			handleClose();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to add balance"));
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
		? isUnlimitedCusEnt(selectedCusEnt)
		: false;

	if (!selectedCusEnt) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Edit Balance" description="No balance selected" />
			</div>
		);
	}

	const fields = updateFields;
	if (!fields) return null;

	const cusProduct = getCusProduct(selectedCusEnt);
	const cusPrice = cusProduct?.customer_prices.find(
		(cp: FullCustomerPrice) =>
			cp.price.entitlement_id === selectedCusEnt.entitlement.id,
	);

	const showOutOfPopover =
		(initialFields.grantedAndPurchasedBalance ?? 0) > 0 ||
		(initialFields.balance ?? 0) > 0;

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
										? "Lifetime"
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
							<GroupedTabButton
								value={mode}
								onValueChange={(v) => setMode(v as "set" | "add")}
								options={[
									{ value: "set", label: "Set Balance" },
									{ value: "add", label: "Add to Balance" },
								]}
							/>

							{mode === "set" ? (
								<div className="flex flex-col gap-3">
									<div className="flex items-end gap-2 w-full">
										<div className="flex items-end gap-2 w-full">
											<div className="flex w-full">
												<LabelInput
													label="Balance"
													placeholder="Enter balance"
													className="w-full"
													type="number"
													value={
														notNullish(fields.balance)
															? String(fields.balance)
															: ""
													}
													onChange={(e) => {
														const newBalance = e.target.value
															? parseFloat(e.target.value)
															: null;
														setUpdateFields({
															...updateFields,
															balance: newBalance,
														});
													}}
												/>
											</div>
											{showOutOfPopover && (
												<GrantedBalancePopover
													grantedBalance={
														fields.grantedAndPurchasedBalance ?? null
													}
													onSave={(newGrantedAndPurchasedBalance) => {
														setUpdateFields({
															...updateFields,
															grantedAndPurchasedBalance:
																newGrantedAndPurchasedBalance,
														});
														setGrantedBalanceChanged(true);
													}}
												/>
											)}
											<div className="text-t4 text-sm truncate mb-1 flex justify-center max-w-full w-full">
												<span className="truncate">
													{numberWithCommas(
														(fields.grantedAndPurchasedBalance ?? 0) -
															(fields.balance ?? 0),
													)}{" "}
													used
												</span>
											</div>
										</div>
									</div>
									<div className="flex flex-col shrink-0 w-full">
										<div className="text-form-label block mb-1">Next Reset</div>
										<DateInputUnix
											disabled={
												!!cusPrice ||
												selectedCusEnt.entitlement.interval === "lifetime"
											}
											unixDate={fields.next_reset_at}
											setUnixDate={(unixDate) => {
												setUpdateFields({
													...updateFields,
													next_reset_at: unixDate,
												});
											}}
										/>
									</div>

									<BalanceEditPreviews
										cusPrice={cusPrice}
										interval={selectedCusEnt.entitlement.interval}
										featureUsageType={feature.config?.usage_type}
										currentBalance={fields.balance}
									/>
								</div>
							) : (
								<div className="flex flex-col gap-3">
									<LabelInput
										label="Amount to Add"
										placeholder="Enter amount"
										className="w-full"
										type="number"
										value={addValue}
										onChange={(e) => setAddValue(e.target.value)}
									/>
									<InfoBox variant="note">
										Current and total granted balance will both be updated.
									</InfoBox>
								</div>
							)}
						</div>
						<Button
							variant="primary"
							className="w-full mt-3"
							isLoading={updateLoading}
							onClick={() =>
								mode === "set"
									? handleUpdateCusEntitlement(selectedCusEnt)
									: handleAddToBalance()
							}
						>
							{mode === "set" ? "Update Balance" : "Add to Balance"}
						</Button>
					</SheetSection>
				)}
			</div>
		</div>
	);
}
