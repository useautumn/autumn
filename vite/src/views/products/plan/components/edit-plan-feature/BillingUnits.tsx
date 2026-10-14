import { type Feature, getFeatureName } from "@autumn/shared";
import {
	Button,
	LabelInput,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { billingUnitsLabel } from "../../utils/billingUnitsUtils";

/** `asColumnHeader` renders as plain header text with a chevron, for the tier table. */
export function BillingUnits({ asColumnHeader = false }) {
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

	const hasMultipleTiers = (item.tiers?.length ?? 0) > 1;

	return (
		<div
			className={cn(
				"flex min-w-0 overflow-hidden",
				hasMultipleTiers && "shrink-0",
			)}
		>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="muted"
						className={cn(
							"min-w-0 max-w-full justify-start overflow-hidden text-tertiary-foreground",
							hasMultipleTiers && "max-w-20",
							asColumnHeader &&
								"!p-0 h-auto max-w-full gap-1 border-0 bg-transparent shadow-none hover:bg-transparent hover:text-foreground",
						)}
					>
						<span
							className={cn(
								"min-w-0 truncate text-xs",
								asColumnHeader && "first-letter:uppercase",
							)}
						>
							{billingUnitsLabel({ item, features })}
						</span>
						{asColumnHeader && (
							<CaretDownIcon className="size-2.5 shrink-0 opacity-60" />
						)}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="max-w-[200px] pt-2" align="start">
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
