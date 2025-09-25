import {
	BillingInterval,
	EntInterval,
	type ProductItemInterval,
} from "@autumn/shared";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

interface UsageResetProps {
	showBillingLabel?: boolean;
}

export function UsageReset({ showBillingLabel = false }: UsageResetProps) {
	const { item, setItem } = useProductItemContext();
	const [open, setOpen] = useState(false);

	if (!item) return null;

	const intervalCount = item.interval_count || 1;

	const handleBillingIntervalSelected = (
		value: BillingInterval | EntInterval | ProductItemInterval,
	) => {
		setItem({
			...item,
			interval:
				value === EntInterval.Lifetime ? null : (value as ProductItemInterval),
		});
	};

	const handleSaveCustomInterval = (newIntervalCount: number) => {
		setItem({
			...item,
			interval_count: newIntervalCount,
		});
		setOpen(false);
	};

	// Get current interval for display - use Lifetime for null intervals
	const currentInterval = item.interval ?? EntInterval.Lifetime;

	const label = showBillingLabel
		? "Usage Reset & Billing Interval"
		: "Usage Reset";

	return (
		<div className={showBillingLabel ? "mt-3" : ""}>
			<div className="text-form-label block mb-2">{label}</div>
			<Select
				value={currentInterval}
				onValueChange={handleBillingIntervalSelected}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder="Select interval" />
				</SelectTrigger>
				<SelectContent>
					{/* Add EntInterval.Lifetime for "no reset" */}
					<SelectItem value={EntInterval.Lifetime}>
						{formatIntervalText({
							interval: EntInterval.Lifetime,
							intervalCount: item.interval_count || undefined,
						})}
					</SelectItem>

					{/* Add BillingInterval options except OneOff (since we have "no reset") */}
					{Object.values(BillingInterval)
						.filter((interval) => interval !== BillingInterval.OneOff)
						.map((interval) => (
							<SelectItem key={interval} value={interval}>
								{formatIntervalText({
									billingInterval: interval,
									intervalCount: item.interval_count || undefined,
									isBillingInterval: true,
								})}
							</SelectItem>
						))}

					{/* Custom interval option */}
					<Popover open={open} onOpenChange={setOpen}>
						<PopoverTrigger asChild>
							<Button
								className="w-full justify-start px-2"
								variant="skeleton"
								disabled={item.included_usage === "∞" || item.interval == null}
							>
								<p className="text-t3">Customise Interval</p>
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							className="p-3 w-[200px]"
							sideOffset={-1}
							onOpenAutoFocus={(e) => e.preventDefault()}
							onCloseAutoFocus={(e) => e.preventDefault()}
						>
							<div className="mb-2">
								<FormLabel>Interval Count</FormLabel>
							</div>
							<div className="flex items-center gap-2">
								<Input
									className="flex-1"
									value={intervalCount}
									onChange={(e) => {
										const value = parseInt(e.target.value) || 1;
										setItem({
											...item,
											interval_count: value,
										});
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleSaveCustomInterval(intervalCount as number);
										}
										if (e.key === "Escape") {
											setOpen(false);
										}
									}}
								/>
								<Button
									variant="secondary"
									className="px-4 h-7"
									onClick={() =>
										handleSaveCustomInterval(intervalCount as number)
									}
								>
									Save
								</Button>
							</div>
						</PopoverContent>
					</Popover>
				</SelectContent>
			</Select>
		</div>
	);
}
