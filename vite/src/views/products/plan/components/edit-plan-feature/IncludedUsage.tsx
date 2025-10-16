import { getFeatureName, Infinite, isContUseItem } from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { UsageReset } from "./UsageReset";

export function IncludedUsage() {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const includedUsage = item.included_usage;

	const isFeaturePrice = isFeaturePriceItem(item);

	// Helper function to get the display value for the input
	const getInputValue = () => {
		if (includedUsage === Infinite) {
			return "Unlimited";
		}
		if (
			includedUsage === null ||
			includedUsage === undefined ||
			includedUsage === 0
		) {
			return "";
		}
		return includedUsage.toString();
	};

	return (
		<div className="space-y-4">
			<div className="w-full h-auto flex items-end gap-2">
				<div className="flex-1">
					<div className="text-form-label block mb-1">
						Quantity of '
						{getFeatureName({
							feature: features.find((f) => f.id === item.feature_id),
							plural: true,
						})}
						' that this customer is granted before{" "}
						{isFeaturePrice ? "hitting the limit" : "being charged"}.
					</div>
					<div className="flex items-center gap-2">
						<Input
							key={`included-usage-${item.feature_id || item.price_id || "default"}`}
							placeholder="eg. 100 credits"
							value={getInputValue()}
							onChange={(e) => {
								const value = e.target.value.trim();

								if (value === "" || value === "0") {
									setItem({ ...item, included_usage: 0 });
								} else {
									const numValue = parseInt(value);
									if (!Number.isNaN(numValue) && numValue > 0) {
										setItem({ ...item, included_usage: numValue });
									}
								}
							}}
							disabled={includedUsage === Infinite}
							type="text"
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
			{!isFeaturePrice && !isContUseItem({ item, features }) && <UsageReset />}
		</div>
	);
}

// <div>
// 	<div className="text-form-label block mb-2">Usage Reset</div>
// 	<Select
// 		value={item.interval ?? EntInterval.Lifetime}
// 		onValueChange={handleBillingIntervalSelected}
// 	>
// 		<SelectTrigger className="w-full">
// 			<SelectValue placeholder="Select interval" />
// 		</SelectTrigger>
// 		<SelectContent>
// 			{/* Add EntInterval.Lifetime for "no reset" */}
// 			<SelectItem value={EntInterval.Lifetime}>
// 				{formatIntervalText({
// 					interval: EntInterval.Lifetime,
// 					intervalCount: item.interval_count || undefined,
// 				})}
// 			</SelectItem>

// 			{/* Add BillingInterval options except OneOff (since we have "no reset") */}
// 			{Object.values(BillingInterval)
// 				.filter((interval) => interval !== BillingInterval.OneOff)
// 				.map((interval) => (
// 					<SelectItem key={interval} value={interval}>
// 						{formatIntervalText({
// 							billingInterval: interval,
// 							intervalCount: item.interval_count || undefined,
// 							isBillingInterval: true,
// 						})}
// 					</SelectItem>
// 				))}

// 			{/* Custom interval option */}
// 			<Popover open={open} onOpenChange={setOpen}>
// 				<PopoverTrigger asChild>
// 					<Button
// 						className="w-full justify-start px-2"
// 						variant="skeleton"
// 						disabled={
// 							item.included_usage === Infinite || item.interval == null
// 						}
// 					>
// 						<p className="text-t3">Customise Interval</p>
// 					</Button>
// 				</PopoverTrigger>
// 				<PopoverContent
// 					align="start"
// 					className="p-3 w-[200px]"
// 					sideOffset={-1}
// 					onOpenAutoFocus={(e) => e.preventDefault()}
// 					onCloseAutoFocus={(e) => e.preventDefault()}
// 				>
// 					<div className="mb-2">
// 						<FormLabel>Interval Count</FormLabel>
// 					</div>
// 					<div className="flex items-center gap-2">
// 						<Input
// 							className="flex-1"
// 							value={intervalCount}
// 							onChange={(e) => {
// 								const value = parseInt(e.target.value) || 1;
// 								setItem({
// 									...item,
// 									interval_count: value,
// 								});
// 							}}
// 							onKeyDown={(e) => {
// 								if (e.key === "Enter") {
// 									handleSaveCustomInterval(intervalCount as number);
// 								}
// 								if (e.key === "Escape") {
// 									setOpen(false);
// 								}
// 							}}
// 						/>
// 						<Button
// 							variant="secondary"
// 							className="px-4 h-7"
// 							onClick={() =>
// 								handleSaveCustomInterval(intervalCount as number)
// 							}
// 						>
// 							Save
// 						</Button>
// 					</div>
// 				</PopoverContent>
// 			</Popover>
// 		</SelectContent>
// 	</Select>
// </div>
