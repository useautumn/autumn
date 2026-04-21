import type { RolloverConfig as RolloverConfigType } from "@autumn/shared";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import {
	DEFAULT_ROLLOVER_CONFIG,
	RolloverConfigForm,
} from "./RolloverConfigForm";

/** Visibility is controlled by parent AdvancedSettings */
export function RolloverConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const rollover = (item.config?.rollover as RolloverConfigType) ?? null;

	const handleChange = (next: RolloverConfigType | null) => {
		const newConfig = { ...(item.config || {}) };
		if (next === null) {
			delete newConfig.rollover;
			setItem({ ...item, config: newConfig });
		} else {
			newConfig.rollover = next;
			setItem({ ...item, config: newConfig });
		}
	};

	const handleEnable = () => {
		setItem({
			...item,
			reset_usage_when_enabled: true,
			config: {
				...(item.config || {}),
				rollover: { ...DEFAULT_ROLLOVER_CONFIG },
			},
		});
	};

	return (
		<RolloverConfigForm
			value={rollover}
			onChange={handleChange}
			onEnable={handleEnable}
			disabled={!item.interval}
		/>
	);
}
