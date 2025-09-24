import { EntInterval, type PriceTier, TierInfinite } from "@autumn/shared";
import { CoinsIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import { IncludedUsageIcon } from "@/components/v2/icons/AutumnIcons";
import { InlineInput } from "@/components/v2/inputs/InlineInput";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { EmptyTierState } from "@/components/v2/states/EmptyTierState";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { TierInputRow } from "./TierInputRow";

export function EditPlanFeatureSheet() {
	const { item } = useProductItemContext();

	// Initialize state from item data
	const [billingType, setBillingType] = useState<"included" | "priced">(
		item?.price !== null || (item?.tiers && item.tiers.length > 0)
			? "priced"
			: "included",
	);

	const [includedUsage, setIncludedUsage] = useState<string>(
		item?.included_usage?.toString() || "",
	);

	const [usageReset, setUsageReset] = useState<EntInterval>(
		item?.interval ? (item.interval as EntInterval) : EntInterval.Month,
	);

	const [unitsPerTier, setUnitsPerTier] = useState(item?.billing_units || 1);
	const [prepaid, setPrepaid] = useState(false);

	// Update state when item changes
	useEffect(() => {
		if (item) {
			setBillingType(
				item.price !== null || (item.tiers && item.tiers.length > 0)
					? "priced"
					: "included",
			);
			setIncludedUsage(item.included_usage?.toString() || "");
			setUsageReset(
				item.interval ? (item.interval as EntInterval) : EntInterval.Month,
			);
			setUnitsPerTier(item.billing_units || 1);
		}
	}, [item]);

	// Check if this is a priced feature (has tiers or price)
	const isPricedFeature =
		billingType === "priced" ||
		(item?.tiers && item.tiers.length > 0) ||
		item?.price !== null;

	// Convert actual tiers to display format for read-only display
	const displayTiers =
		item?.tiers?.map((tier: PriceTier, index: number) => {
			const isLast = index === (item.tiers?.length || 0) - 1;
			const isInfinite = tier.to === TierInfinite;

			return {
				to: isInfinite ? "∞" : tier.to.toString(),
				amount: tier.amount.toString(),
				units: item.billing_units?.toString() || "1",
				label:
					index === 0
						? "For the first"
						: isLast && isInfinite
							? "After"
							: "For the next",
			};
		}) || [];

	const addTier = () => {
		// Read-only for now - placeholder function
	};

	const removeTier = (_index: number) => {
		// Read-only for now - placeholder function
	};

	const updateTier = (
		_index: number,
		_field: "to" | "amount",
		_value: string,
	) => {
		// Read-only for now - placeholder function
	};

	return (
		<>
			<SheetHeader
				title="Edit Feature"
				description="Configure how this feature is used in your app"
			/>
			<SheetSection title="Billing Type">
				<div className="space-y-4 billing-type-section">
					<div className="grid grid-cols-2 gap-4 items-center">
						<PanelButton
							isSelected={billingType === "included"}
							onClick={() => setBillingType("included")}
							icon={<IncludedUsageIcon />}
						/>
						<div className="max-w-[12rem]">
							<div className="text-sub mb-1">Included</div>
							<div className="text-body-secondary leading-tight">
								Set included usage limits with reset intervals (e.g. 100
								credits/month)
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4 items-center">
						<PanelButton
							isSelected={billingType === "priced"}
							onClick={() => setBillingType("priced")}
							icon={<CoinsIcon size={20} />}
						/>
						<div className="max-w-[12rem]">
							<div className="text-sub mb-1">Priced</div>
							<div className="text-body-secondary leading-tight">
								Set usage and overage pricing (e.g. 100 credits/month, $1 extra)
							</div>
						</div>
					</div>
				</div>
			</SheetSection>
			<SheetSection title="Included usage (optional)">
				<div className="space-y-4">
					<LabelInput
						label="Included usage before payment"
						placeholder="eg. 100 credits"
						value={includedUsage}
						onChange={(e) => setIncludedUsage(e.target.value)}
					/>
				</div>
			</SheetSection>

			{isPricedFeature && (
				<SheetSection
					title={
						<div className="flex flex-wrap items-baseline gap-1 leading-relaxed min-h-[1.5rem] break-words">
							<span className="flex-shrink-0">Price per</span>
							<InlineInput
								type="number"
								value={unitsPerTier}
								onChange={(value) => setUnitsPerTier(value as number)}
								variant="violet"
								autoWidth={true}
								minWidth="2rem"
								maxWidth="6rem"
								min={1}
								max={999999}
								className="flex-shrink-0"
							/>
							<span className="flex-shrink-0">
								units (after included usage)
							</span>
						</div>
					}
				>
					<div className="space-y-3 pricing-tiers-section">
						{displayTiers.length > 0 ? (
							// biome-ignore lint/suspicious/noExplicitAny: idk what the type is
							displayTiers.map((tier: any, index: number) => (
								<TierInputRow
									key={index}
									label={tier.label}
									to={tier.to}
									units={unitsPerTier}
									amount={tier.amount}
									currency="USD"
									onAddTier={addTier}
									onRemoveTier={() => removeTier(index)}
									onUpdateTier={(field, value) =>
										updateTier(index, field, value)
									}
									canAdd={true}
									canRemove={displayTiers.length > 1}
									isReadOnly={true}
								/>
							))
						) : (
							<EmptyTierState onAddTier={addTier} isDisabled={true} />
						)}

						<div className="mt-6 space-y-4">
							<div>
								<div className="text-form-label block mb-2">
									Usage Reset & Billing Interval
								</div>
								<Select
									value={usageReset}
									onValueChange={(value) => setUsageReset(value as EntInterval)}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select interval" />
									</SelectTrigger>
									<SelectContent>
										{Object.values(EntInterval).map((interval) => (
											<SelectItem key={interval} value={interval}>
												{keyToTitle(interval)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<LongCheckbox
								title="Prepaid"
								subtitle="Quantity will be chosen during checkout."
								checked={prepaid}
								onCheckedChange={setPrepaid}
							/>
						</div>
					</div>
				</SheetSection>
			)}
		</>
	);
}
