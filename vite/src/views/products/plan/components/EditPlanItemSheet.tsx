import { EntInterval, type PriceTier, TierInfinite } from "@autumn/shared";
import { ArrowsCounterClockwise, Coins } from "@phosphor-icons/react";
import { useState } from "react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";

import {
	IncludedUsageIcon,
	UsageBasedIcon,
} from "@/components/v2/icons/AutumnIcons";
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

export function EditPlanItemSheet() {
	const { item } = useProductItemContext();
	const [featureBehaviour, setFeatureBehaviour] = useState<
		"consumable" | "persistent"
	>("consumable");
	const [billingType, setBillingType] = useState<"included" | "priced">(
		"included",
	);
	const [usageReset, setUsageReset] = useState<EntInterval>(EntInterval.Month);
	const [unitsPerTier, setUnitsPerTier] = useState(1);
	const [prepaid, setPrepaid] = useState(false);

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
			<SheetSection title="Feature Behaviour">
				<div className="space-y-4 feature-behaviour-section">
					<div className="grid grid-cols-2 gap-3 items-stretch">
						<PanelButton
							isSelected={featureBehaviour === "consumable"}
							onClick={() => setFeatureBehaviour("consumable")}
							icon={<UsageBasedIcon />}
						/>
						<div>
							<div className="text-checkbox-label mb-1">Consumable</div>
							<div className="text-body-secondary">
								Set limit for included usage and reset interval (e.g. 100
								credits/month)
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 items-stretch">
						<PanelButton
							isSelected={featureBehaviour === "persistent"}
							onClick={() => setFeatureBehaviour("persistent")}
							icon={<ArrowsCounterClockwise size={20} />}
						/>
						<div>
							<div className="text-checkbox-label mb-1">Persistent</div>
							<div className="text-body-secondary">
								Set limits for usage and overage pricing (e.g. 100
								credits/month, $1 per extra)
							</div>
						</div>
					</div>
				</div>
			</SheetSection>
			<SheetSection title="Billing Type">
				<div className="space-y-4 billing-type-section">
					<div className="grid grid-cols-2 gap-3 items-stretch">
						<PanelButton
							isSelected={billingType === "included"}
							onClick={() => setBillingType("included")}
							icon={<IncludedUsageIcon />}
						/>
						<div>
							<div className="text-checkbox-label mb-1">Included</div>
							<div className="text-body-secondary">
								Set limit for included usage and reset interval (e.g. 100
								credits/month)
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 items-stretch">
						<PanelButton
							isSelected={billingType === "priced"}
							onClick={() => setBillingType("priced")}
							icon={<Coins size={20} />}
						/>
						<div>
							<div className="text-checkbox-label mb-1">Priced</div>
							<div className="text-body-secondary">
								Set limits for usage and overage pricing (e.g. 100
								credits/month, $1 per extra)
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
					/>
				</div>
			</SheetSection>

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
						<span className="flex-shrink-0">units (after included usage)</span>
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
								onUpdateTier={(field, value) => updateTier(index, field, value)}
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

						<div className="flex items-start gap-2">
							<Checkbox
								checked={prepaid}
								onCheckedChange={(checked) =>
									setPrepaid(checked === "indeterminate" ? false : checked)
								}
								className="mt-0.5"
								size="sm"
							/>
							<div className="flex flex-col gap-0.5">
								<div className="text-checkbox-label">Prepaid</div>
								<div className="text-body-secondary">
									Quantity will be chosen during checkout.
								</div>
							</div>
						</div>
					</div>
				</div>
			</SheetSection>
		</>
	);
}
