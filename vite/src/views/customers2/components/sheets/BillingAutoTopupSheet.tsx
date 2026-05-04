import {
	type AutoTopup,
	type AutoTopupResponse,
	cusEntToCusPrice,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	formatAmount,
	fullCustomerToCustomerEntitlements,
	isPrepaidCustomerEntitlement,
	PurchaseLimitInterval,
	type UsagePriceConfig,
} from "@autumn/shared";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

const INTERVAL_LABELS: Record<string, string> = {
	[PurchaseLimitInterval.Hour]: "Hour",
	[PurchaseLimitInterval.Day]: "Day",
	[PurchaseLimitInterval.Week]: "Week",
	[PurchaseLimitInterval.Month]: "Month",
};

export function BillingAutoTopupSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const sheetType = useSheetStore((s) => s.type);
	const { customer, refetch } = useCusQuery();
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance();

	const isEdit = sheetType === "billing-auto-topup-edit";
	const existingItem = sheetData?.item as AutoTopupResponse | undefined;
	const existingIndex = sheetData?.index as number | undefined;

	const expandedPurchaseLimit = useMemo(() => {
		const limit = existingItem?.purchase_limit;
		if (!limit || !("count" in limit)) return null;
		return limit;
	}, [existingItem]);

	const [isSaving, setIsSaving] = useState(false);
	const [featureId, setFeatureId] = useState(existingItem?.feature_id ?? "");
	const [enabled, setEnabled] = useState(existingItem?.enabled ?? true);
	const [threshold, setThreshold] = useState(
		existingItem?.threshold?.toString() ?? "",
	);
	const [quantity, setQuantity] = useState(
		existingItem?.quantity?.toString() ?? "",
	);
	const [hasPurchaseLimit, setHasPurchaseLimit] = useState(
		!!existingItem?.purchase_limit,
	);
	const [purchaseLimitInterval, setPurchaseLimitInterval] = useState(
		existingItem?.purchase_limit?.interval ?? "",
	);
	const [purchaseLimitIntervalCount, setPurchaseLimitIntervalCount] = useState(
		existingItem?.purchase_limit?.interval_count?.toString() ?? "1",
	);
	const [purchaseLimitLimit, setPurchaseLimitLimit] = useState(
		existingItem?.purchase_limit?.limit?.toString() ?? "",
	);
	const [invoiceMode, setInvoiceMode] = useState(
		existingItem?.invoice_mode ?? false,
	);

	const fullCustomer = customer as FullCustomer | undefined;
	const consumableFeatures = (features ?? []).filter(
		(f: Feature) =>
			!f.archived &&
			f.type !== FeatureType.Boolean &&
			f.config?.usage_type !== FeatureUsageType.Continuous,
	);

	const topupPriceInfo = useMemo(() => {
		if (!featureId || !fullCustomer) return null;

		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId,
		});

		const prepaidCusEnt = cusEnts.find((cusEnt: FullCusEntWithFullCusProduct) =>
			isPrepaidCustomerEntitlement(cusEnt),
		);

		if (!prepaidCusEnt) return { hasPrice: false as const };

		const cusPrice = cusEntToCusPrice({ cusEnt: prepaidCusEnt });
		if (!cusPrice) return { hasPrice: false as const };

		const config = cusPrice.price.config as UsagePriceConfig;
		const billingUnits = config.billing_units || 1;
		const tiers = config.usage_tiers;

		return {
			hasPrice: true as const,
			isTiered: tiers.length > 1,
			unitAmount: tiers[0].amount,
			billingUnits,
		};
	}, [featureId, fullCustomer]);

	const buildItem = (): AutoTopup | null => {
		if (!featureId) {
			toast.error("Please select a feature");
			return null;
		}
		const parsedThreshold = Number.parseFloat(threshold);
		if (Number.isNaN(parsedThreshold) || parsedThreshold < 0) {
			toast.error("Please enter a valid threshold");
			return null;
		}
		const parsedQuantity = Number.parseInt(quantity, 10);
		if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
			toast.error("Please enter a valid quantity (min 1)");
			return null;
		}

		const item: AutoTopup = {
			feature_id: featureId,
			enabled,
			threshold: parsedThreshold,
			quantity: parsedQuantity,
		};

		if (hasPurchaseLimit && purchaseLimitInterval && purchaseLimitLimit) {
			const parsedLimit = Number.parseInt(purchaseLimitLimit, 10);
			const parsedIntervalCount = Number.parseInt(
				purchaseLimitIntervalCount,
				10,
			);
			if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
				toast.error("Please enter a valid purchase limit");
				return null;
			}
			item.purchase_limit = {
				interval: purchaseLimitInterval as PurchaseLimitInterval,
				interval_count:
					Number.isNaN(parsedIntervalCount) || parsedIntervalCount < 1
						? 1
						: parsedIntervalCount,
				limit: parsedLimit,
			};
		}

		if (invoiceMode) {
			item.invoice_mode = true;
		}

		return item;
	};

	const handleSave = async () => {
		const item = buildItem();
		if (!item) return;

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentAutoTopups = [...(fullCustomer?.auto_topups ?? [])];

		if (isEdit && existingIndex !== undefined) {
			currentAutoTopups[existingIndex] = item;
		} else {
			currentAutoTopups.push(item);
		}

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: {
						auto_topups: currentAutoTopups,
					},
				},
			});
			await refetch();
			closeSheet();
			toast.success(isEdit ? "Auto top-up updated" : "Auto top-up added");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save auto top-up"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (existingIndex === undefined) return;

		const customerId = fullCustomer?.id || fullCustomer?.internal_id;
		if (!customerId) return;

		const currentAutoTopups = [...(fullCustomer?.auto_topups ?? [])];
		currentAutoTopups.splice(existingIndex, 1);

		setIsSaving(true);
		try {
			await CusService.updateCustomer({
				axios: axiosInstance,
				customer_id: customerId,
				data: {
					billing_controls: {
						auto_topups: currentAutoTopups,
					},
				},
			});
			await refetch();
			closeSheet();
			toast.success("Auto top-up deleted");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete auto top-up"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-y-auto">
				<SheetHeader
					title={isEdit ? "Edit Auto Top-up" : "Add Auto Top-up"}
					description="Configure automatic credit top-ups when a feature balance drops below a threshold."
				/>

				<SheetSection withSeparator>
					<FormLabel>Feature</FormLabel>
					{isEdit ? (
						<div className="text-sm text-t2">
							{consumableFeatures.find((f: Feature) => f.id === featureId)
								?.name ?? featureId}
						</div>
					) : (
						<FeatureSearchDropdown
							features={consumableFeatures}
							value={featureId || null}
							onSelect={setFeatureId}
						/>
					)}
				</SheetSection>

				{featureId && topupPriceInfo && (
					<SheetSection withSeparator>
						{topupPriceInfo.hasPrice ? (
							<InfoBox variant="note">
								{topupPriceInfo.isTiered
									? "Pricing for this feature is tiered — the charge per top-up depends on current usage."
									: `Customer will be charged ${formatAmount({ org, amount: topupPriceInfo.unitAmount })} per ${topupPriceInfo.billingUnits === 1 ? "unit" : `${topupPriceInfo.billingUnits} units`}.`}
							</InfoBox>
						) : (
							<InfoBox variant="warning">
								No prepaid price found for this feature. This auto top-up won't
								take effect until the customer has a product with a prepaid
								price for this feature.
							</InfoBox>
						)}
					</SheetSection>
				)}

				<SheetSection withSeparator>
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Enabled</FormLabel>
							<Switch checked={enabled} onCheckedChange={setEnabled} />
						</div>

						<div>
							<FormLabel>Threshold</FormLabel>
							<Input
								placeholder="Balance threshold to trigger top-up"
								type="number"
								value={threshold}
								onChange={(e) => setThreshold(e.target.value)}
							/>
						</div>

						<div>
							<FormLabel>Quantity</FormLabel>
							<Input
								placeholder="Credits to add per top-up"
								type="number"
								value={quantity}
								onChange={(e) => setQuantity(e.target.value)}
							/>
						</div>

						<div className="flex items-center justify-between">
							<FormLabel className="mb-0">Invoice mode</FormLabel>
							<Switch checked={invoiceMode} onCheckedChange={setInvoiceMode} />
						</div>
					</div>
				</SheetSection>

				<SheetSection withSeparator={false}>
					<div className="flex items-center gap-2 mb-2">
						<Checkbox
							checked={hasPurchaseLimit}
							onCheckedChange={(checked) =>
								setHasPurchaseLimit(checked === true)
							}
						/>
						<FormLabel className="mb-0">Purchase limit</FormLabel>
					</div>

					{hasPurchaseLimit && expandedPurchaseLimit && (
						<InfoBox variant="note"
						classNames={{
							infoBox: "my-3"
						}}
						>
							{expandedPurchaseLimit.count} of{" "}
							{expandedPurchaseLimit.limit ?? "∞"} top-ups used this window
							{expandedPurchaseLimit.next_reset_at && (
								<>
									{" · Resets "}
									{format(
										new Date(expandedPurchaseLimit.next_reset_at),
										"MMM d, yyyy",
									)}
								</>
							)}
						</InfoBox>
					)}

					{hasPurchaseLimit && (
						<div className="flex flex-col gap-3">
							<div>
								<FormLabel>Interval</FormLabel>
								<Select
									value={purchaseLimitInterval}
									onValueChange={setPurchaseLimitInterval}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select interval" />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(INTERVAL_LABELS).map(([value, label]) => {
											const count = Number.parseInt(
												purchaseLimitIntervalCount,
												10,
											);
											const displayLabel =
												count > 1
													? `Every ${count} ${label.toLowerCase()}s`
													: label;
											return (
												<SelectItem key={value} value={value}>
													{displayLabel}
												</SelectItem>
											);
										})}
										<PurchaseLimitIntervalPopover
											intervalCount={purchaseLimitIntervalCount}
											onSave={setPurchaseLimitIntervalCount}
											disabled={!purchaseLimitInterval}
										/>
									</SelectContent>
								</Select>
							</div>

							<div>
								<FormLabel>Max top-ups</FormLabel>
								<Input
									placeholder="Max top-ups in interval"
									type="number"
									value={purchaseLimitLimit}
									onChange={(e) => setPurchaseLimitLimit(e.target.value)}
								/>
							</div>
						</div>
					)}
				</SheetSection>

				<div className="flex-1" />

				{isEdit && (
					<div className="px-4 pb-2">
						<Button
							variant="ghost"
							className="text-destructive hover:text-destructive w-full"
							onClick={handleDelete}
							disabled={isSaving}
						>
							Delete auto top-up
						</Button>
					</div>
				)}

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSaving}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleSave}
						isLoading={isSaving}
						disabled={!featureId}
					>
						{isEdit ? "Save" : "Add"}
					</Button>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}

function PurchaseLimitIntervalPopover({
	intervalCount,
	onSave,
	disabled,
}: {
	intervalCount: string;
	onSave: (value: string) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [localCount, setLocalCount] = useState(intervalCount || "1");

	const handleSave = () => {
		onSave(localCount);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					className="w-full justify-start px-2 group-hover:text-primary active:border-0"
					variant="skeleton"
					disabled={disabled}
				>
					<p className="text-t3 group-hover/btn:text-primary">
						Customize Interval
					</p>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="p-3 w-[200px] z-101"
				sideOffset={-1}
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<div className="mb-2">
					<FieldLabel>Interval Count</FieldLabel>
				</div>
				<div className="flex items-center gap-2">
					<Input
						className="flex-1"
						type="number"
						value={localCount}
						onChange={(e) => setLocalCount(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "-" || e.key === "Minus") {
								e.preventDefault();
							}
							if (e.key === "Enter") {
								handleSave();
							}
							if (e.key === "Escape") {
								setOpen(false);
							}
						}}
					/>
					<Button variant="secondary" className="px-4 h-7" onClick={handleSave}>
						Save
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
