import {
	type AutoTopup,
	type Entity,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	isOneOffPrice,
	isPrepaidPrice,
	isUnlimitedCusEnt,
	numberWithCommas,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
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
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { getBackendErr, notNullish } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useCustomerContext } from "../../customer/CustomerContext";
import { AutoTopUpSection } from "./AutoTopUpSection";
import { BalanceEditPreviews } from "./BalanceEditPreviews";
import { GrantedBalancePopover } from "./GrantedBalancePopover";
import {
	type BalanceEditFormInstance,
	useBalanceEditForm,
} from "./useBalanceEditForm";

/* ─── Outer Shell ─── */

export function BalanceEditSheet() {
	const { customer } = useCusQuery();
	const { entityId } = useCustomerContext();
	const { featureId, originalEntitlements, selectedCusEntId } =
		useCustomerBalanceSheetStore();

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

	const selectedCusEnt = originalEntitlements.find(
		(ent) => ent.id === selectedCusEntId,
	);

	if (!selectedCusEnt) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader title="Edit Balance" description="No balance selected" />
			</div>
		);
	}

	const isUnlimited = isUnlimitedCusEnt(selectedCusEnt);
	const feature = selectedCusEnt.entitlement.feature;

	const cusProduct = customer?.customer_products.find(
		(cp: FullCusProduct) => cp.id === selectedCusEnt.customer_product_id,
	);
	const cusPrice = cusProduct?.customer_prices.find(
		(cp: FullCustomerPrice) =>
			cp.price.entitlement_id === selectedCusEnt.entitlement.id,
	);

	const hasOneOffPrepaidPrice = cusPrice
		? isOneOffPrice(cusPrice.price) && isPrepaidPrice(cusPrice.price)
		: false;
	const hasExistingAutoTopUp = customer?.auto_topup?.some(
		(c: AutoTopup) => c.feature_id === featureId,
	);
	const isEligibleForAutoTopUp =
		hasOneOffPrepaidPrice || !!hasExistingAutoTopUp;

	const existingAutoTopUp =
		customer?.auto_topup?.find((c: AutoTopup) => c.feature_id === featureId) ??
		null;

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title={feature.name}
				description={
					<CopyButton text={feature.id} size="sm" innerClassName="font-mono">
						{feature.id}
					</CopyButton>
				}
				breadcrumbs={undefined}
			/>

			{isUnlimited ? (
				<UnlimitedBalanceInfo
					customer={customer}
					selectedCusEnt={selectedCusEnt}
					cusProduct={cusProduct}
				/>
			) : (
				<BalanceEditForm
					selectedCusEnt={selectedCusEnt}
					entityId={entityId}
					customer={customer}
					cusProduct={cusProduct}
					cusPrice={cusPrice}
					featureId={featureId}
					existingAutoTopUp={existingAutoTopUp}
					isEligibleForAutoTopUp={isEligibleForAutoTopUp}
				/>
			)}
		</div>
	);
}

/* ─── Unlimited Info (no form needed) ─── */

function UnlimitedBalanceInfo({
	customer,
	selectedCusEnt,
	cusProduct,
}: {
	customer: any;
	selectedCusEnt: FullCustomerEntitlement;
	cusProduct: FullCusProduct | undefined;
}) {
	return (
		<div className="flex-1 overflow-y-auto">
			<SheetSection withSeparator={false}>
				<EntitlementInfoRows
					customer={customer}
					selectedCusEnt={selectedCusEnt}
					cusProduct={cusProduct}
					isUnlimited
				/>
			</SheetSection>
		</div>
	);
}

/* ─── Inner Form ─── */

function BalanceEditForm({
	selectedCusEnt,
	entityId,
	customer,
	cusProduct,
	cusPrice,
	featureId,
	existingAutoTopUp,
	isEligibleForAutoTopUp,
}: {
	selectedCusEnt: FullCustomerEntitlement;
	entityId: string | null;
	customer: any;
	cusProduct: FullCusProduct | undefined;
	cusPrice: FullCustomerPrice | undefined;
	featureId: string;
	existingAutoTopUp: AutoTopup | null;
	isEligibleForAutoTopUp: boolean;
}) {
	const form = useBalanceEditForm({
		selectedCusEnt,
		entityId,
		existingAutoTopUp,
	});

	return (
		<div className="flex-1 overflow-y-auto">
			<SheetSection withSeparator>
				<EntitlementInfoRows
					customer={customer}
					selectedCusEnt={selectedCusEnt}
					cusProduct={cusProduct}
					isUnlimited={false}
				/>
			</SheetSection>

			<SheetSection withSeparator={isEligibleForAutoTopUp}>
				<BalanceFields
					form={form}
					selectedCusEnt={selectedCusEnt}
					cusPrice={cusPrice}
				/>
			</SheetSection>

			{isEligibleForAutoTopUp && (
				<SheetSection withSeparator={false}>
					<AutoTopUpSection form={form} />
				</SheetSection>
			)}

			<SubmitButton
				form={form}
				customer={customer}
				featureId={featureId}
				entityId={entityId}
				selectedCusEnt={selectedCusEnt}
				cusPrice={cusPrice}
			/>
		</div>
	);
}

/* ─── Entitlement Info Rows ─── */

function EntitlementInfoRows({
	customer,
	selectedCusEnt,
	cusProduct,
	isUnlimited,
}: {
	customer: any;
	selectedCusEnt: FullCustomerEntitlement;
	cusProduct: FullCusProduct | undefined;
	isUnlimited: boolean;
}) {
	const entity = customer?.entities?.find((e: Entity) => {
		if (selectedCusEnt.internal_entity_id) {
			return e.internal_id === selectedCusEnt.internal_entity_id;
		}
		return (
			e.internal_id === cusProduct?.internal_entity_id ||
			e.id === cusProduct?.entity_id
		);
	});

	return (
		<div className="flex flex-col gap-2 rounded-lg">
			{entity && <InfoRow label="Entity" value={entity.name || entity.id} />}
			<InfoRow label="Plan" value={cusProduct?.product.name || "N/A"} />
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
			{selectedCusEnt.expires_at && (
				<InfoRow
					label="Expires At"
					value={`${
						formatUnixToDateTime(selectedCusEnt.expires_at, {
							withYear: true,
						}).date
					}, ${formatUnixToDateTime(selectedCusEnt.expires_at).time}`}
				/>
			)}
		</div>
	);
}

/* ─── Balance Fields Section ─── */

function BalanceFields({
	form,
	selectedCusEnt,
	cusPrice,
}: {
	form: BalanceEditFormInstance;
	selectedCusEnt: FullCustomerEntitlement;
	cusPrice: FullCustomerPrice | undefined;
}) {
	const mode = useStore(form.store, (s) => s.values.mode);
	const feature = selectedCusEnt.entitlement.feature;

	const showOutOfPopover = useStore(form.store, (s) => {
		const gpb = s.values.grantedAndPurchasedBalance ?? 0;
		const bal = s.values.balance ?? 0;
		return gpb > 0 || bal > 0;
	});

	return (
		<div className="flex flex-col gap-3">
			<form.Field name="mode">
				{(field) => (
					<GroupedTabButton
						value={field.state.value}
						onValueChange={(v) => field.handleChange(v as "set" | "add")}
						options={[
							{ value: "set", label: "Set Balance" },
							{ value: "add", label: "Add to Balance" },
						]}
					/>
				)}
			</form.Field>

			{mode === "set" ? (
				<SetBalanceFields
					form={form}
					selectedCusEnt={selectedCusEnt}
					cusPrice={cusPrice}
					feature={feature}
					showOutOfPopover={showOutOfPopover}
				/>
			) : (
				<AddBalanceFields form={form} />
			)}
		</div>
	);
}

/* ─── Set Balance Mode ─── */

function SetBalanceFields({
	form,
	selectedCusEnt,
	cusPrice,
	feature,
	showOutOfPopover,
}: {
	form: BalanceEditFormInstance;
	selectedCusEnt: FullCustomerEntitlement;
	cusPrice: FullCustomerPrice | undefined;
	feature: FullCustomerEntitlement["entitlement"]["feature"];
	showOutOfPopover: boolean;
}) {
	const balance = useStore(form.store, (s) => s.values.balance);
	const gpb = useStore(form.store, (s) => s.values.grantedAndPurchasedBalance);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-end gap-2 w-full">
				<div className="flex items-end gap-2 w-full">
					<div className="flex w-full">
						<form.Field name="balance">
							{(field) => (
								<LabelInput
									label="Balance"
									placeholder="Enter balance"
									className="w-full"
									type="number"
									value={
										notNullish(field.state.value)
											? String(field.state.value)
											: ""
									}
									onChange={(e) => {
										const v = e.target.value;
										field.handleChange(v ? parseFloat(v) : null);
									}}
								/>
							)}
						</form.Field>
					</div>
					{showOutOfPopover && (
						<form.Field name="grantedAndPurchasedBalance">
							{(field) => (
								<GrantedBalancePopover
									grantedBalance={field.state.value}
									onSave={(v) => field.handleChange(v)}
								/>
							)}
						</form.Field>
					)}
					<div className="text-t4 text-sm truncate mb-1 flex justify-center max-w-full w-full">
						<span className="truncate">
							{numberWithCommas((gpb ?? 0) - (balance ?? 0))} used
						</span>
					</div>
				</div>
			</div>

			<div className="flex flex-col shrink-0 w-full">
				<div className="text-form-label block mb-1">Next Reset</div>
				<form.Field name="nextResetAt">
					{(field) => (
						<DateInputUnix
							disabled={
								!!cusPrice || selectedCusEnt.entitlement.interval === "lifetime"
							}
							unixDate={field.state.value}
							setUnixDate={(v) => field.handleChange(v)}
							withTime
							use24Hour
						/>
					)}
				</form.Field>
			</div>

			<BalanceEditPreviews
				cusPrice={cusPrice}
				interval={selectedCusEnt.entitlement.interval}
				featureUsageType={feature.config?.usage_type}
				currentBalance={balance}
			/>
		</div>
	);
}

/* ─── Add Balance Mode ─── */

function AddBalanceFields({ form }: { form: BalanceEditFormInstance }) {
	return (
		<div className="flex flex-col gap-3">
			<form.Field name="addValue">
				{(field) => (
					<LabelInput
						label="Amount to Add"
						placeholder="Enter amount"
						className="w-full"
						type="number"
						value={
							notNullish(field.state.value) ? String(field.state.value) : ""
						}
						onChange={(e) => {
							const v = e.target.value;
							field.handleChange(v ? parseFloat(v) : null);
						}}
					/>
				)}
			</form.Field>
			<InfoBox variant="note">
				Current and total granted balance will both be updated.
			</InfoBox>
		</div>
	);
}

/* ─── Submit Button ─── */

function SubmitButton({
	form,
	customer,
	featureId,
	entityId,
	selectedCusEnt,
	cusPrice,
}: {
	form: BalanceEditFormInstance;
	customer: any;
	featureId: string;
	entityId: string | null;
	selectedCusEnt: FullCustomerEntitlement;
	cusPrice: FullCustomerPrice | undefined;
}) {
	const { refetch } = useCusQuery();
	const { closeSheet: closeBalanceSheet } = useCustomerBalanceSheetStore();
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const axiosInstance = useAxiosInstance();
	const [loading, setLoading] = useState(false);

	const isDirty = useStore(form.store, (s) => s.isDirty);

	const handleClose = () => {
		closeBalanceSheet();
		closeSheet();
	};

	const handleSave = async () => {
		const values = form.state.values;
		const promises: Promise<unknown>[] = [];

		// Validate before firing any requests
		if (hasBalanceChanges({ form })) {
			if (values.mode === "set") {
				const balanceNum = parseFloat(String(values.balance));
				if (Number.isNaN(balanceNum)) {
					toast.error("Please enter a valid balance");
					return;
				}
				if (cusPrice && values.nextResetAt !== selectedCusEnt.next_reset_at) {
					toast.error("Not allowed to change reset date for paid features");
					return;
				}
			} else {
				const addNum = parseFloat(String(values.addValue));
				if (Number.isNaN(addNum)) {
					toast.error("Please enter a valid amount");
					return;
				}
			}
		}

		setLoading(true);
		try {
			// Queue balance update
			if (hasBalanceChanges({ form })) {
				if (values.mode === "set") {
					const prepaidAllowance =
						(form.options.defaultValues?.grantedAndPurchasedBalance ?? 0) -
						(form.options.defaultValues?.balance ?? 0);
					const grantedBalanceInput =
						(values.grantedAndPurchasedBalance ?? 0) - prepaidAllowance;

					promises.push(
						axiosInstance.post("/v1/balances/update", {
							customer_id: customer.id || customer.internal_id,
							feature_id: featureId,
							current_balance: parseFloat(String(values.balance)),
							granted_balance: grantedBalanceInput ?? undefined,
							customer_entitlement_id: selectedCusEnt.id,
							entity_id: entityId ?? undefined,
							next_reset_at: values.nextResetAt ?? undefined,
						}),
					);
				} else {
					promises.push(
						axiosInstance.post("/v1/balances/update", {
							customer_id: customer.id || customer.internal_id,
							feature_id: featureId,
							add_to_balance: parseFloat(String(values.addValue)),
							customer_entitlement_id: selectedCusEnt.id,
							entity_id: entityId ?? undefined,
						}),
					);
				}
			}

			// Queue auto top-up update
			if (hasAutoTopUpChanges({ form })) {
				const autoTopUp = values.autoTopUp;
				const newConfig: AutoTopup = {
					feature_id: featureId,
					enabled: autoTopUp.enabled,
					threshold: autoTopUp.threshold ?? 0,
					quantity: autoTopUp.quantity ?? 1,
					...(autoTopUp.enabled &&
						autoTopUp.maxPurchasesEnabled && {
							purchase_limit: {
								interval: autoTopUp.interval,
								limit: autoTopUp.maxPurchases ?? 1,
							},
						}),
				};

				const otherConfigs = (customer.auto_topup ?? []).filter(
					(c: AutoTopup) => c.feature_id !== featureId,
				);

				promises.push(
					CusService.updateCustomer({
						axios: axiosInstance,
						customer_id: customer.id || customer.internal_id,
						data: {
							billing_controls: {
								auto_topups: [...otherConfigs, newConfig],
							},
						},
					}),
				);
			}

			await Promise.all(promises);
			toast.success("Updated successfully");
			handleClose();
			refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update"));
			setLoading(false);
		}
	};

	return (
		<div className="px-4 pb-4">
			<Button
				variant="primary"
				className="w-full"
				isLoading={loading}
				disabled={!isDirty}
				onClick={handleSave}
			>
				Update
			</Button>
		</div>
	);
}

/* ─── Dirty Helpers ─── */

function hasBalanceChanges({
	form,
}: {
	form: BalanceEditFormInstance;
}): boolean {
	const meta = form.state.fieldMeta;

	if (form.state.values.mode === "add") {
		return meta.addValue?.isDirty ?? false;
	}

	return (
		meta.balance?.isDirty ||
		meta.nextResetAt?.isDirty ||
		meta.grantedAndPurchasedBalance?.isDirty ||
		false
	);
}

function hasAutoTopUpChanges({
	form,
}: {
	form: BalanceEditFormInstance;
}): boolean {
	const meta = form.state.fieldMeta;

	return (
		meta["autoTopUp.enabled"]?.isDirty ||
		meta["autoTopUp.threshold"]?.isDirty ||
		meta["autoTopUp.quantity"]?.isDirty ||
		meta["autoTopUp.maxPurchasesEnabled"]?.isDirty ||
		meta["autoTopUp.interval"]?.isDirty ||
		meta["autoTopUp.maxPurchases"]?.isDirty ||
		false
	);
}
