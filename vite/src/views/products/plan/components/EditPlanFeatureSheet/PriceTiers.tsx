import { Infinite, type PriceTier } from "@autumn/shared";
import { TrashSimpleIcon } from "@phosphor-icons/react";
import { Plus } from "lucide-react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { Input } from "@/components/v2/inputs/Input";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { BillingUnits } from "./BillingUnits";
import { addTier, removeTier, updateTier } from "./tierUtils";

export function PriceTiers() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const tiers = item.tiers || [];
	const includedUsage = item.included_usage || 0;

	// Only show pricing UI if billing type is "priced" (has tiers)
	if (!tiers || tiers.length === 0) {
		return null;
	}

	// Simple single tier UI - just amount input with billing units
	if (tiers.length === 1) {
		const firstTier = tiers[0];

		return (
			<div className="space-y-2">
				<div className="text-form-label">Pricing Tiers</div>
				<div className="flex gap-2 w-full items-center">
					<div className="w-32">
						<Input
							value={firstTier.amount === 0 ? "" : firstTier.amount.toString()}
							onChange={(e) =>
								updateTier({
									item,
									setItem,
									index: 0,
									field: "amount",
									value: e.target.value,
								})
							}
							inputMode="numeric"
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
							className="p-1"
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
			<div className="text-form-label">Pricing Tiers</div>
			{tiers.map((tier: PriceTier, index: number) => {
				const isInfinite = tier.to === Infinite;
				const _isLastTier = index === tiers.length - 1;

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
										value={
											isInfinite ? "∞" : tier.to === 0 ? "" : tier.to.toString()
										}
										onChange={(e) =>
											updateTier({
												item,
												setItem,
												index,
												field: "to",
												value: e.target.value,
											})
										}
										className="w-full"
										placeholder={isInfinite ? "∞" : "100"}
										inputMode="numeric"
										disabled={isInfinite || (tiers.length === 2 && index === 1)} // Disable infinity or 2nd tier in 2-tier setup
									/>
								</div>
							</div>

							{/* Price input - simple v2 input */}
							<div className="w-32">
								<Input
									value={tier.amount === 0 ? "" : tier.amount.toString()}
									onChange={(e) =>
										updateTier({
											item,
											setItem,
											index,
											field: "amount",
											value: e.target.value,
										})
									}
									inputMode="numeric"
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
