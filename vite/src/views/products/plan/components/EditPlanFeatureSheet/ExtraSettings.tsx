import { EntInterval, UsageModel } from "@autumn/shared";
import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function ExtraSettings() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	// Derive values from item - no props needed
	const usageReset = item.interval
		? (item.interval as EntInterval)
		: EntInterval.Month;
	const prepaid = item.usage_model === UsageModel.Prepaid;
	return (
		<div className="mt-6 space-y-4">
			<div>
				<div className="text-form-label block mb-2">
					Usage Reset & Billing Interval
				</div>
				<Select
					value={usageReset}
					onValueChange={(value) => {
						const interval = value as EntInterval;
						setItem({ ...item, interval });
					}}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select interval" />
					</SelectTrigger>
					<SelectContent>
						{Object.values(EntInterval).map((interval) => (
							<SelectItem key={interval} value={interval}>
								{keyToTitle(interval)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<LongCheckbox
				title="Prepaid"
				subtitle="Quantity will be chosen during checkout."
				checked={prepaid}
				onCheckedChange={(checked) => {
					const newUsageModel = checked
						? UsageModel.Prepaid
						: UsageModel.PayPerUse;
					setItem({ ...item, usage_model: newUsageModel });
				}}
			/>
		</div>
	);
}
