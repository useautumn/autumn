import { useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function BillingUnits() {
	const { org } = useOrg();
	const [popoverOpen, setPopoverOpen] = useState(false);
	const { item, setItem } = useProductItemContext();
	const triggerRef = useRef<HTMLButtonElement>(null);

	if (!item) return null;

	const handleEnterClick = () => {
		setItem({ ...item, billing_units: Number(item.billing_units) });
		setPopoverOpen(false);
	};

	const currency = org?.default_currency?.toUpperCase() ?? "USD";

	return (
		<div className="flex max-w-28 min-w-28">
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<Button
						ref={triggerRef}
						size="default"
						variant="skeleton"
						className="w-fit max-w-32 text-body-secondary overflow-hidden hover:bg-transparent justify-start p-1 h-auto
							[&:focus]:outline-none [&:focus-visible]:outline-none [&:focus]:ring-0 [&:focus-visible]:ring-0"
					>
						<span className={cn("truncate text-xs")}>
							{item.billing_units === 1
								? `${currency} per unit`
								: `${currency} per ${item.billing_units} units`}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent className="max-w-md p-1" align="start">
					<Input
						type="number"
						value={item.billing_units === 0 ? "" : (item.billing_units ?? "")}
						onChange={(e) =>
							setItem({ ...item, billing_units: Number(e.target.value) })
						}
						placeholder="e.g. 100 units"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								if (popoverOpen) {
									handleEnterClick();
								}
							}
						}}
						onBlur={handleEnterClick}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
