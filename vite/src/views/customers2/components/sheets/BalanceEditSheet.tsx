import {
	cusEntsToBalance,
	cusEntsToGrantedBalance,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	isUnlimitedCusEnt,
} from "@autumn/shared";
import { LinkBreakIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { Input } from "@/components/v2/inputs/Input";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
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
	const [isGrantedBalanceUnlinked, setIsGrantedBalanceUnlinked] =
		useState(false);

	const hasMultipleBalances = originalEntitlements.length > 1;
	const [grantedBalanceChanged, setGrantedBalanceChanged] = useState(false);

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

		const balance = cusEntsToBalance({
			cusEnts: [selectedCusEnt],
			entityId: entityId ?? undefined,
			withRollovers: true,
		});

		const grantedBalance = cusEntsToGrantedBalance({
			cusEnts: [selectedCusEnt],
			entityId: entityId ?? undefined,
		});

		return {
			balance: balance !== null ? balance : null,
			grantedBalance: grantedBalance !== null ? grantedBalance : null,
			next_reset_at: selectedCusEnt.next_reset_at,
		};
	}, [selectedCusEnt, entityId]);

	const [updateFields, setUpdateFields] = useState(initialFields);

	// Reset fields when selected entitlement changes
	useEffect(() => {
		setUpdateFields(initialFields);
		setIsGrantedBalanceUnlinked(false);
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

		const grantedBalanceInt = parseFloat(String(updateFields.grantedBalance));
		if (Number.isNaN(grantedBalanceInt)) {
			toast.error("Granted balance not valid");
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
			await axiosInstance.post("/v1/balances/update", {
				customer_id: customer.id || customer.internal_id,
				feature_id: featureId,
				current_balance: balanceInt,
				granted_balance: grantedBalanceChanged ? grantedBalanceInt : undefined,
				customer_entitlement_id: cusEnt.id,
				entity_id: entityId ?? undefined,
			});
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
							<div className="flex gap-3">
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
													const newLinkedBalance =
														initialFields.grantedBalance != null
															? initialFields.grantedBalance +
																((newBalance ?? 0) -
																	(initialFields.balance ?? 0))
															: null;

													setUpdateFields({
														...updateFields,
														balance: newBalance,
														grantedBalance: isGrantedBalanceUnlinked
															? updateFields.grantedBalance
															: newLinkedBalance,
													});
												}}
											/>
										</div>
										{(initialFields.grantedBalance ?? 0) > 0 &&
											(isGrantedBalanceUnlinked ? (
												<>
													<span className="text-t4 text-sm pb-1">/</span>
													<div className="flex items-center gap-1 w-full">
														<Input
															type="number"
															className="h-7 px-1.5"
															autoFocus
															value={
																notNullish(updateFields.grantedBalance)
																	? String(updateFields.grantedBalance)
																	: ""
															}
															onChange={(e) => {
																setUpdateFields({
																	...updateFields,
																	grantedBalance: e.target.value
																		? parseFloat(e.target.value)
																		: null,
																});
																setGrantedBalanceChanged(true);
															}}
															onBlur={() => setIsGrantedBalanceUnlinked(false)}
														/>
													</div>
												</>
											) : (
												<IconButton
													variant="skeleton"
													iconOrientation="right"
													className="gap-1.5 text-t3"
													icon={<LinkBreakIcon className="size-3" />}
													onClick={() =>
														setIsGrantedBalanceUnlinked(
															!isGrantedBalanceUnlinked,
														)
													}
												>
													<div className="text-sm inline-flex max-w-16">
														<span className="shrink-0">/&nbsp;</span>
														<span className="truncate min-w-0">
															{fields.grantedBalance}
														</span>
													</div>
												</IconButton>
											))}
									</div>
								</div>
								<div className="flex flex-col shrink-0 w-full max-w-40 min-w-40">
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
