import {
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	getCusEntBalance,
} from "@autumn/shared";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateInputUnix } from "@/components/general/DateInputUnix";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCustomerContext } from "../CustomerContext";

export function CustomerBalanceModal() {
	const { customer, refetch } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { type, featureId, originalEntitlements, closeSheet } =
		useCustomerBalanceSheetStore();

	const [updateLoading, setUpdateLoading] = useState<string | null>(null);
	const [selectedCusEntId, setSelectedCusEntId] = useState<string | null>(null);
	const axiosInstance = useAxiosInstance();

	const initialFields = useMemo(() => {
		if (!originalEntitlements.length) {
			return new Map<
				string,
				{ balance: number | null; next_reset_at: number | null }
			>();
		}

		const fields = new Map<
			string,
			{ balance: number | null; next_reset_at: number | null }
		>();

		for (const cusEnt of originalEntitlements) {
			const balance = getCusEntBalance({
				cusEnt,
				entityId,
			}).balance;

			fields.set(cusEnt.id, {
				balance,
				next_reset_at: cusEnt.next_reset_at,
			});
		}

		return fields;
	}, [featureId, entityId, originalEntitlements]);

	const [updateFields, setUpdateFields] = useState(initialFields);

	// Update fields when featureId changes (reset state for new balance)
	useEffect(() => {
		setUpdateFields(initialFields);
		setSelectedCusEntId(null);
	}, [initialFields]);

	if (!featureId || !originalEntitlements.length) return null;

	const firstEnt = originalEntitlements[0];
	const feature = firstEnt.entitlement.feature;
	const hasMultipleBalances = originalEntitlements.length > 1;
	const showSelectionStep = hasMultipleBalances && !selectedCusEntId;

	const getCusProduct = (cusEnt: FullCustomerEntitlement) => {
		const cusProduct = customer.customer_products.find(
			(cp: FullCusProduct) => cp.id === cusEnt.customer_product_id,
		);
		return cusProduct;
	};

	const handleUpdateCusEntitlement = async (
		cusEnt: FullCustomerEntitlement,
	) => {
		const fields = updateFields.get(cusEnt.id);
		if (!fields) return;

		const balanceInt = parseFloat(String(fields.balance));
		if (Number.isNaN(balanceInt)) {
			toast.error("Balance not valid");
			return;
		}

		const cusProduct = getCusProduct(cusEnt);
		const cusPrice = cusProduct?.customer_prices.find(
			(cp: FullCustomerPrice) =>
				cp.price.entitlement_id === cusEnt.entitlement.id,
		);

		if (cusPrice && fields.next_reset_at !== cusEnt.next_reset_at) {
			toast.error(`Not allowed to change reset at for paid features`);
			return;
		}

		setUpdateLoading(cusEnt.id);
		try {
			await CusService.updateCusEntitlement(
				axiosInstance,
				customer.id || customer.internal_id,
				cusEnt.id,
				{
					balance: balanceInt,
					next_reset_at: fields.next_reset_at,
					entity_id: entityId,
				},
			);
			toast.success("Balance updated successfully");
			await refetch();
			closeSheet();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update entitlement"));
		}
		setUpdateLoading(null);
	};

	// Render selection step
	if (showSelectionStep) {
		return (
			<Dialog
				open={type === "edit-balance"}
				onOpenChange={(open) => {
					if (!open) closeSheet();
				}}
			>
				<DialogContent className="max-w-lg bg-card max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Select Balance to Update</DialogTitle>
						<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
							{feature.name}
						</CopyButton>
					</DialogHeader>

					<div className="flex flex-col gap-3">
						{originalEntitlements.map((cusEnt: FullCustomerEntitlement) => {
							const cusProduct = getCusProduct(cusEnt);
							const fields = updateFields.get(cusEnt.id);
							const balance = fields?.balance;

							return (
								<button
									key={cusEnt.id}
									type="button"
									onClick={() => setSelectedCusEntId(cusEnt.id)}
									className="flex flex-col gap-2 bg-secondary p-3 rounded-lg border border-border-table hover:border-border-hover hover:bg-muted transition-colors text-left"
								>
									{cusProduct?.name && (
										<div className="text-sm font-medium text-t1">
											{cusProduct.name}
										</div>
									)}
									<div className="flex flex-col gap-1.5">
										<div className="flex gap-2 items-center">
											<span className="text-t3 text-sm">Plan ID:</span>
											<span className="text-t1 text-sm font-mono truncate">
												{cusProduct?.product_id || "N/A"}
											</span>
										</div>
										{cusProduct?.entity_id && (
											<div className="flex gap-2 items-center">
												<span className="text-t3 text-sm">Entity ID:</span>
												<span className="text-t1 text-sm font-mono truncate">
													{cusProduct.entity_id}
												</span>
											</div>
										)}
										<div className="flex gap-2 items-center">
											<span className="text-t3 text-sm">Current Balance:</span>
											<span className="text-t1 text-sm font-medium">
												{notNullish(balance)
													? new Intl.NumberFormat().format(balance)
													: "N/A"}
											</span>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	// Render update form step
	const selectedCusEnt = hasMultipleBalances
		? originalEntitlements.find((ent) => ent.id === selectedCusEntId)
		: originalEntitlements[0];

	if (!selectedCusEnt) return null;

	return (
		<Dialog
			open={type === "edit-balance"}
			onOpenChange={(open) => {
				if (!open) closeSheet();
			}}
		>
			<DialogContent className="max-w-lg bg-card max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{hasMultipleBalances && (
							<button
								type="button"
								onClick={() => setSelectedCusEntId(null)}
								className="text-t3 hover:text-t2 text-sm mr-2"
							>
								←
							</button>
						)}
						{feature.name}
					</DialogTitle>

					<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
						{feature.id}
					</CopyButton>
				</DialogHeader>

				<div className="flex flex-col gap-6">
					{(() => {
						const cusEnt = selectedCusEnt;
						const fields = updateFields.get(cusEnt.id);
						if (!fields) return null;

						const initialFieldsForEnt = initialFields.get(cusEnt.id);

						const hasChanges =
							initialFieldsForEnt &&
							(fields.balance !== initialFieldsForEnt.balance ||
								fields.next_reset_at !== initialFieldsForEnt.next_reset_at);

						const cusProduct = getCusProduct(cusEnt);
						const cusPrice = cusProduct?.customer_prices.find(
							(cp: FullCustomerPrice) =>
								cp.price.entitlement_id === cusEnt.entitlement.id,
						);

						return (
							<div className="flex flex-col gap-4">
								{/* {cusProduct?.name && (
									<div className="text-sm text-t2">
										From product:{" "}
										<span className="font-medium">{cusProduct.name}</span>
									</div>
								)} */}

								<div className="flex flex-col gap-2 bg-secondary p-3 rounded-lg border border-border-table">
									<div className="flex gap-2">
										<span className="text-t3 text-sm font-medium">
											Plan ID:
										</span>
										<span className="text-t1 text-sm font-mono truncate">
											{cusProduct?.product_id || "N/A"}
										</span>
									</div>
									{cusProduct?.entity_id && (
										<div className="flex gap-2">
											<span className="text-t3 text-sm font-medium">
												Entity ID:
											</span>
											<span className="text-t1 text-sm font-mono truncate">
												{cusProduct.entity_id}
											</span>
										</div>
									)}
									<div className="flex gap-2">
										<span className="text-t3 text-sm font-medium">
											Reset Interval:
										</span>
										<span className="text-t1 text-sm">
											{cusEnt.entitlement.interval === "lifetime"
												? "never"
												: cusEnt.entitlement.interval}
										</span>
									</div>
								</div>

								<div className="flex flex-col gap-3">
									<div className="flex gap-3">
										<LabelInput
											label="Balance"
											placeholder="Enter balance"
											type="number"
											className="flex-1"
											value={
												notNullish(fields.balance) ? String(fields.balance) : ""
											}
											onChange={(e) => {
												const newFields = new Map(updateFields);
												const current = newFields.get(cusEnt.id) || {
													balance: null,
													next_reset_at: null,
												};
												newFields.set(cusEnt.id, {
													...current,
													balance: e.target.value
														? parseFloat(e.target.value)
														: null,
												});
												setUpdateFields(newFields);
											}}
										/>

										<div className="flex-1">
											<div className="text-form-label block mb-1">
												Next Reset
											</div>
											<DateInputUnix
												disabled={!!cusPrice}
												unixDate={fields.next_reset_at}
												setUnixDate={(unixDate) => {
													const newFields = new Map(updateFields);
													const current = newFields.get(cusEnt.id) || {
														balance: null,
														next_reset_at: null,
													};
													newFields.set(cusEnt.id, {
														...current,
														next_reset_at: unixDate,
													});
													setUpdateFields(newFields);
												}}
											/>
										</div>
									</div>

									{cusPrice && (
										<InfoBox classNames={{ infoBox: "text-sm p-2" }}>
											Reset cycle cannot be changed for paid features, as it
											follows the billing cycle.
										</InfoBox>
									)}
								</div>

								<div className="flex justify-end">
									<Button
										variant="primary"
										isLoading={updateLoading === cusEnt.id}
										// disabled={!hasChanges}
										onClick={() => handleUpdateCusEntitlement(cusEnt)}
									>
										Update Balance
									</Button>
								</div>
							</div>
						);
					})()}
				</div>
			</DialogContent>
		</Dialog>
	);
}
