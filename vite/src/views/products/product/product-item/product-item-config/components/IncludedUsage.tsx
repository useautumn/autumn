import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { 
	Infinite, 
	BillingInterval,
	EntInterval,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useProductItemContext } from "../../ProductItemContext";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";

export const IncludedUsage = () => {
	const { item, setItem } = useProductItemContext();
	const isFeaturePrice = isFeaturePriceItem(item);
	const [open, setOpen] = useState(false);
	const [intervalCount, setIntervalCount] = useState<number | string>(
		item.interval_count || 1,
	);

	const handleBillingIntervalSelected = (value: BillingInterval | EntInterval) => {
		let usageModel = item.usage_model;
		if (value === BillingInterval.OneOff) {
			usageModel = UsageModel.Prepaid;
		}

		setItem({
			...item,
			interval: value === BillingInterval.OneOff || value === EntInterval.Lifetime ? null : value,
			usage_model: usageModel,
		});
	};

	const handleSaveCustomInterval = () => {
		setItem({
			...item,
			interval_count: parseInt(intervalCount.toString()),
		});
		setOpen(false);
	};

	// Get current interval for display
	const currentInterval = item.interval ?? BillingInterval.OneOff;

	return (
		<div className="w-full transition-all duration-400 ease-in-out space-y-4">
			<div className="space-y-2">
				<FieldLabel className="flex items-center gap-2">
					Included Usage
					<InfoTooltip>
						<span className="">
							How much of this feature can be used for free with this plan. If
							there is no price, it is a usage limit.
							<br />
							<br />
							Leave this blank if the feature is paid-only. Eg, 10 USD per seat.
						</span>
					</InfoTooltip>
				</FieldLabel>
				<div className="flex w-full h-fit gap-2">
					<Input
						placeholder="eg. 300"
						className=""
						disabled={item.included_usage == Infinite}
						value={
							item.included_usage == Infinite
								? "Unlimited"
								: item.included_usage || ""
						}
						type={item.included_usage === Infinite ? "text" : "number"}
						onChange={(e) => {
							const newItem = {
								...item,
								included_usage: e.target.value,
							};

							setItem(newItem);
						}}
					/>
					<ToggleDisplayButton
						label="Unlimited"
						show={item.included_usage == Infinite}
						className="h-8"
						disabled={isFeaturePrice}
						onClick={() => {
							if (itemIsUnlimited(item)) {
								setItem({
									...item,
									included_usage: "",
								});
							} else {
								setItem({
									...item,
									included_usage: Infinite,
									interval: null,
								});
							}
						}}
					>
						♾️
					</ToggleDisplayButton>
				</div>
			</div>

			<div className="space-y-2">
				<FieldLabel className="flex items-center gap-2">
					Usage Reset & Billing Interval
					<InfoTooltip>
						<span className="">
							How often usage counts reset for this feature. Choose "no reset"
							for items that don't expire.
						</span>
					</InfoTooltip>
				</FieldLabel>
				<div className="flex flex-col gap-2">
					<Select
						value={currentInterval}
						onValueChange={handleBillingIntervalSelected}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select reset interval" />
						</SelectTrigger>
						<SelectContent>
							{/* Add EntInterval.Lifetime for "no reset" */}
							<SelectItem value={EntInterval.Lifetime}>
								{formatIntervalText({
									interval: EntInterval.Lifetime,
									intervalCount: item.interval_count,
								})}
							</SelectItem>
							{/* Add BillingInterval options */}
							{Object.values(BillingInterval).map((interval) => (
								<SelectItem key={interval} value={interval}>
									{formatIntervalText({
										billingInterval: interval,
										intervalCount: item.interval_count,
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
										disabled={item.included_usage === Infinite || item.interval == null}
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
										<FieldLabel>Interval Count</FieldLabel>
									</div>
									<div className="flex items-center gap-2">
										<Input
											className="flex-1"
											value={intervalCount}
											onChange={(e) => setIntervalCount(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													handleSaveCustomInterval();
												}
												if (e.key === "Escape") {
													setOpen(false);
												}
											}}
										/>
										<Button variant="secondary" className="px-4 h-7" onClick={handleSaveCustomInterval}>
											Save
										</Button>
									</div>
								</PopoverContent>
							</Popover>
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
};
