import {
	BillingInterval,
	EntInterval,
	Infinite,
	isContUseItem,
	type ProductItemInterval,
} from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function IncludedUsage() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();
	const [open, setOpen] = useState(false);

	if (!item) return null;

	const includedUsage = item.included_usage;
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

	const isFeaturePrice = isFeaturePriceItem(item);

	return (
		<div className="space-y-4">
			<div className="w-full h-auto flex items-end gap-2">
				<div className="flex-1">
					<div className="text-form-label block mb-1">
						Included usage before payment
					</div>
					<div className="flex items-center gap-2">
						<Input
							placeholder="eg. 100 credits"
							value={
								includedUsage === 0
									? ""
									: includedUsage?.toString() === Infinite
										? "Unlimited"
										: includedUsage?.toString()
							}
							onChange={(e) => {
								const value = e.target.value;
								const numValue = value === "" ? 0 : parseInt(value) || 0;
								setItem({ ...item, included_usage: numValue });
							}}
							disabled={includedUsage === Infinite}
						/>
						<IconCheckbox
							hide={isFeaturePrice}
							icon={<InfinityIcon />}
							iconOrientation="center"
							variant="muted"
							size="default"
							checked={includedUsage === Infinite}
							onCheckedChange={(checked) =>
								setItem({
									...item,
									included_usage: checked ? Infinite : 1,
									interval: checked ? null : item.interval, // Set interval to null when unlimited
								})
							}
							className="py-1 px-2"
						/>
					</div>
				</div>
			</div>

			{/* Only show Usage Reset dropdown for included billing type */}
			{!isFeaturePrice && !isContUseItem({ item, features }) && (
				<div>
					<div className="text-form-label block mb-2">Usage Reset</div>
					<Select
						value={item.interval ?? EntInterval.Lifetime}
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
										disabled={
											item.included_usage === Infinite || item.interval == null
										}
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
			)}
		</div>
	);
}
