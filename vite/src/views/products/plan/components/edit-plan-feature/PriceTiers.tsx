import { Infinite, type PriceTier } from "@autumn/shared";
import { TrashSimpleIcon } from "@phosphor-icons/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { addTier, removeTier, updateTier } from "../../utils/tierUtils";
import { BillingUnits } from "./BillingUnits";

export function PriceTiers() {
	const { item, setItem } = useProductItemContext();

	// Track raw input values during editing
	const [editingValues, setEditingValues] = useState<Record<string, string>>(
		{},
	);
	const [isEditing, setIsEditing] = useState<Record<string, boolean>>({});

	if (!item) return null;

	const tiers = item.tiers || [];
	const includedUsage = item.included_usage || 0;

	// Helper functions for managing input editing state
	const handleInputFocus = (key: string, currentValue: number | string) => {
		setIsEditing((prev) => ({ ...prev, [key]: true }));
		setEditingValues((prev) => ({
			...prev,
			[key]: currentValue === 0 ? "" : currentValue.toString(),
		}));
	};

	const handleInputBlur = (
		key: string,
		field: "amount" | "to",
		tierIndex?: number,
	) => {
		const rawValue = editingValues[key] || "";
		setIsEditing((prev) => ({ ...prev, [key]: false }));

		if (tierIndex !== undefined) {
			updateTier({ item, setItem, index: tierIndex, field, value: rawValue });
		}
	};

	const handleInputChange = (
		key: string,
		value: string,
		field: "amount" | "to",
		tierIndex?: number,
	) => {
		setEditingValues((prev) => ({ ...prev, [key]: value }));

		// Live update the item as user types
		if (tierIndex !== undefined) {
			updateTier({ item, setItem, index: tierIndex, field, value });
		}
	};

	const getDisplayValue = (key: string, actualValue: number | string) => {
		if (isEditing[key]) {
			return editingValues[key] || "";
		}
		return actualValue === 0 ? "" : actualValue.toString();
	};

	// Only show pricing UI if billing type is "priced" (has tiers)
	if (!tiers || tiers.length === 0) {
		return null;
	}

	// Simple single tier UI - just amount input with billing units
	if (tiers.length === 1) {
		const firstTier = tiers[0];
		const amountKey = "single-tier-amount";

		return (
			<div className="space-y-2">
				<FormLabel>Pricing Tiers</FormLabel>
				<div className="flex gap-2 w-full items-center">
					<div className="w-32">
						<Input
							value={getDisplayValue(amountKey, firstTier.amount)}
							onFocus={() => handleInputFocus(amountKey, firstTier.amount)}
							onBlur={() => handleInputBlur(amountKey, "amount", 0)}
							onChange={(e) =>
								handleInputChange(amountKey, e.target.value, "amount", 0)
							}
							inputMode="decimal"
							placeholder="0.00"
						/>
					</div>

					<BillingUnits />

					<div className="flex items-center ml-auto gap-1 pl-2">
						<IconButton
							variant="muted"
							size="sm"
							onClick={() => addTier({ item, setItem })}
							icon={<Plus size={12} />}
							iconOrientation="left"
						>
							Add Tiers
						</IconButton>
					</div>
				</div>
			</div>
		);
	}

	// Multi-tier UI - full tier management
	return (
		<div className="space-y-2">
			<FormLabel>Pricing Tiers</FormLabel>
			{tiers.map((tier: PriceTier, index: number) => {
				const isInfinite = tier.to === Infinite;
				const toKey = `tier-${index}-to`;
				const amountKey = `tier-${index}-amount`;

				return (
					<div key={index} className="flex gap-2 w-full items-center">
						<div className="w-full gap-2 flex items-center">
							<div className="flex w-full items-center">
								<div className="flex w-full text-sm items-center gap-2">
									{/* From value - first tier starts from included usage or 0 */}
									<Input
										value={
											index === 0
												? (includedUsage || 0).toString()
												: (tiers[index - 1]?.to || 0).toString()
										}
										onChange={() => null} // Read-only for "from" value
										className="w-full"
										disabled
									/>
								</div>
								<span className="px-2 text-body-secondary text-xs">to</span>
								<div className="flex w-full text-sm">
									{/* To value - disable if infinite (last tier) or if 2nd tier in 2-tier setup */}
									<Input
										value={isInfinite ? "∞" : getDisplayValue(toKey, tier.to)}
										onFocus={() =>
											!isInfinite && handleInputFocus(toKey, tier.to)
										}
										onBlur={() =>
											!isInfinite && handleInputBlur(toKey, "to", index)
										}
										onChange={(e) =>
											!isInfinite &&
											handleInputChange(toKey, e.target.value, "to", index)
										}
										className="w-full"
										placeholder={isInfinite ? "∞" : "100"}
										inputMode="decimal"
										disabled={isInfinite || (tiers.length === 2 && index === 1)} // Disable infinity or 2nd tier in 2-tier setup
									/>
								</div>
							</div>

							{/* Price input - simple v2 input */}
							<div className="w-32">
								<Input
									value={getDisplayValue(amountKey, tier.amount)}
									onFocus={() => handleInputFocus(amountKey, tier.amount)}
									onBlur={() => handleInputBlur(amountKey, "amount", index)}
									onChange={(e) =>
										handleInputChange(
											amountKey,
											e.target.value,
											"amount",
											index,
										)
									}
									inputMode="decimal"
									placeholder="0.00"
								/>
							</div>

							{/* Interactive units display */}
							<BillingUnits />
						</div>

						{/* Action buttons */}
						<div className="flex items-center gap-1 pl-2">
							<IconButton
								variant="muted"
								size="sm"
								onClick={() => addTier({ item, setItem })}
								icon={<Plus size={12} />}
								className="p-1"
							/>
							<IconButton
								variant="muted"
								size="sm"
								onClick={() => removeTier({ item, setItem, index })}
								icon={<TrashSimpleIcon size={12} />}
								className="p-1"
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
