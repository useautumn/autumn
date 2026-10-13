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
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { billingUnitsLabel } from "../../utils/billingUnitsUtils";

/** `asColumnHeader` renders the control as plain header text with a chevron, for the tier table. */
export function BillingUnits({
	asColumnHeader = false,
}: {
	asColumnHeader?: boolean;
}) {
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

	const label = billingUnitsLabel({ item, features });

	return (
		<div className="flex min-w-0 overflow-hidden">
			<Popover open={open} onOpenChange={setOpen}>
				{asColumnHeader ? (
					<PopoverTrigger
						render={
							<button
								type="button"
								className="flex min-w-0 cursor-pointer items-center gap-1 text-tertiary-foreground text-xs outline-none hover:text-foreground focus-visible:text-foreground"
							/>
						}
					>
						<span className="min-w-0 truncate first-letter:uppercase">
							{label}
						</span>
						<CaretDownIcon className="size-2.5 shrink-0 opacity-60" />
					</PopoverTrigger>
				) : (
					<PopoverTrigger asChild>
						<Button
							variant="muted"
							className="min-w-0 max-w-full justify-start overflow-hidden text-tertiary-foreground"
						>
							<span className="min-w-0 truncate text-xs">{label}</span>
						</Button>
					</PopoverTrigger>
				)}
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
