import { type Feature, getFeatureName } from "@autumn/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { LabelInput } from "@/components/v2/inputs/LabelInput";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function BillingUnits() {
	const { features } = useFeaturesQuery();
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { item, setItem } = useProductItemContext();
	const [billingUnits, setBillingUnits] = useState(item?.billing_units);
	const triggerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		setBillingUnits(item?.billing_units ?? 1);
	}, [item?.billing_units]);

	if (!item) return null;

	const handleEnterClick = () => {
		setItem({
			...item,
			billing_units: billingUnits === 0 || "" ? 1 : Number(billingUnits),
		});
		setDropdownOpen(false);
	};

	const unitName = getFeatureName({
		feature: features.find((f: Feature) => f.id === item.feature_id),
		plural: Boolean(item.billing_units && item.billing_units > 1),
		capitalize: false,
	});

	return (
		<div className="flex shrink w-fit max-w-32">
			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						ref={triggerRef}
						variant="muted"
						className={cn(
							item.tiers?.length && item.tiers.length > 1
								? "max-w-20 text-t3"
								: "w-full text-t3",
							// "w-fit max-w-32 text-body-secondary overflow-hidden hover:bg-transparent justify-start p-1 h-auto [&:focus]:outline-none [&:focus-visible]:outline-none [&:focus]:ring-0 [&:focus-visible]:ring-0",
							// "underline hover:text-t3",
						)}
					>
						<span className={cn("truncate text-xs")}>
							{item.billing_units === 1
								? `per ${unitName}`
								: `per ${item.billing_units} ${unitName}`}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="max-w-[200px] p-3 pt-2 z-100"
					align="start"
				>
					<LabelInput
						label={`Billing units (${unitName})`}
						type="number"
						value={billingUnits === 0 ? "" : (billingUnits ?? "")}
						onChange={(e) => setBillingUnits(Number(e.target.value))}
						placeholder="e.g. 100 units"
						onKeyDown={(e) => {
							if (e.key === "-" || e.key === "Minus") {
								e.preventDefault();
							}
							if (e.key === "Enter") {
								if (dropdownOpen) {
									handleEnterClick();
								}
							}
						}}
						onBlur={handleEnterClick}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
