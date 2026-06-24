import { type Feature, getFeatureName } from "@autumn/shared";
import {
	Button,
	LabelInput,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { useEffect, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function BillingUnits() {
	const { features } = useFeaturesQuery();
	const [open, setOpen] = useState(false);
	const { item, setItem } = useProductItemContext();
	const [billingUnits, setBillingUnits] = useState(item?.billing_units);

	useEffect(() => {
		setBillingUnits(item?.billing_units ?? 1);
	}, [item?.billing_units]);

	if (!item) return null;

	const handleSubmit = () => {
		setItem({
			...item,
			billing_units: billingUnits === 0 || "" ? 1 : Number(billingUnits),
		});
		setOpen(false);
	};

	const unitName = getFeatureName({
		feature: features.find((f: Feature) => f.id === item.feature_id),
		plural: Boolean(item.billing_units && item.billing_units > 1),
		capitalize: false,
	});

	return (
		<div className="flex shrink w-fit max-w-32">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="muted"
						className={cn(
							item.tiers?.length && item.tiers.length > 1
								? "max-w-20 text-tertiary-foreground"
								: "w-full text-tertiary-foreground",
						)}
					>
						<span className={cn("truncate text-xs")}>
							{item.billing_units === 1
								? `per ${unitName}`
								: `per ${item.billing_units} ${unitName}`}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="max-w-[200px] p-3 pt-2" align="start">
					<LabelInput
						label={`Billing units (${unitName})`}
						type="number"
						step="any"
						value={billingUnits === 0 ? "" : (billingUnits ?? "")}
						onChange={(e) => setBillingUnits(Number(e.target.value))}
						placeholder="e.g. 100 units"
						onKeyDown={(e) => {
							if (e.key === "-" || e.key === "Minus") {
								e.preventDefault();
							}
							if (e.key === "Enter") {
								handleSubmit();
							}
						}}
						onBlur={handleSubmit}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
