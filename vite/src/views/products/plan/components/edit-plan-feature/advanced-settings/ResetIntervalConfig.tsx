import {
	EntInterval,
	entToItemInterval,
	itemToEntInterval,
} from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { formatIntervalText } from "@/utils/formatUtils/formatTextUtils";
import { nullish } from "@/utils/genUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { CustomiseIntervalPopover } from "../../CustomiseIntervalPopover";

// Reset interval is an entitlement interval, so one-off/lifetime aren't options.
const resetIntervalOptions = Object.values(EntInterval).filter(
	(interval) => interval !== EntInterval.Lifetime,
);

/** Visibility is controlled by parent AdvancedSettings */
export function ResetIntervalConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const resetInterval = itemToEntInterval({ item });

	// A non-null price_interval pins billing to its own cycle, freeing `interval`
	// to be the (possibly different) reset cycle.
	const isSeparateResetActive = !nullish(item.price_interval);

	const setSeparateReset = (enabled: boolean) => {
		if (enabled) {
			setItem({
				...item,
				price_interval: item.interval,
				price_interval_count: item.interval_count ?? 1,
			});
			return;
		}

		setItem({
			...item,
			interval: item.price_interval,
			interval_count: item.price_interval_count ?? 1,
			price_interval: null,
			price_interval_count: null,
		});
	};

	const handleResetIntervalChange = (value: string) => {
		setItem({
			...item,
			interval: entToItemInterval({ entInterval: value as EntInterval }),
			interval_count: 1,
		});
	};

	return (
		<AreaCheckbox
			title="Reset balance on a different interval"
			description="Grant and reset the included usage on a separate cycle to billing."
			checked={isSeparateResetActive}
			onCheckedChange={setSeparateReset}
		>
			<div className="space-y-2 w-xs max-w-full">
				<FormLabel>Reset interval</FormLabel>
				<div className="flex items-center gap-2">
					<Select
						value={resetInterval}
						onValueChange={handleResetIntervalChange}
						items={Object.fromEntries(
							resetIntervalOptions.map((interval) => [
								interval,
								formatIntervalText({
									interval,
									intervalCount: item.interval_count || undefined,
								}),
							]),
						)}
					>
						<SelectTrigger
							className="w-full"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{resetIntervalOptions.map((interval) => (
								<SelectItem key={interval} value={interval}>
									{formatIntervalText({
										interval,
										intervalCount: item.interval_count || undefined,
									})}
								</SelectItem>
							))}
							<CustomiseIntervalPopover item={item} setItem={setItem} />
						</SelectContent>
					</Select>
				</div>
			</div>
		</AreaCheckbox>
	);
}
