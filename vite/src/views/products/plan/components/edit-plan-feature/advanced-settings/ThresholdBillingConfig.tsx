import { AreaCheckbox, FormLabel, Input } from "@autumn/ui";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { itemThreshold, withThresholdBilling } from "./thresholdBillingItem";

const DEFAULT_THRESHOLD = 100;

/** Visibility is controlled by parent AdvancedSettings */
export function ThresholdBillingConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const threshold = itemThreshold({ item });
	const setThreshold = (next: number | null) =>
		setItem(withThresholdBilling({ item, threshold: next }));

	return (
		<AreaCheckbox
			title="Threshold billing"
			description="Bill overage as soon as unbilled usage reaches this many units, instead of waiting for the end of the cycle."
			checked={threshold !== null}
			onCheckedChange={(checked) =>
				setThreshold(checked ? DEFAULT_THRESHOLD : null)
			}
		>
			<div className="space-y-2 w-xs max-w-full">
				<FormLabel>Bill every</FormLabel>
				<Input
					type="number"
					min={1}
					value={threshold ?? ""}
					onChange={(e) => {
						const parsed = Number.parseFloat(e.target.value);
						setThreshold(
							Number.isFinite(parsed) && parsed > 0
								? parsed
								: DEFAULT_THRESHOLD,
						);
					}}
					placeholder={`e.g. ${DEFAULT_THRESHOLD}`}
					onClick={(e) => e.stopPropagation()}
				/>
			</div>
		</AreaCheckbox>
	);
}
