import { EntitlementDuration, type EntitlementExpiry } from "@autumn/shared";
import {
	AreaCheckbox,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

const DEFAULT_EXPIRY: EntitlementExpiry = {
	duration: EntitlementDuration.Month,
	length: 1,
};

/** Visibility is controlled by parent AdvancedSettings */
export function ExpiryConfig() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const expiry = (item.config?.expiry as EntitlementExpiry) ?? null;

	const setExpiry = (next: EntitlementExpiry | null) => {
		const config = { ...(item.config || {}) };
		if (next === null) {
			delete config.expiry;
		} else {
			config.expiry = next;
		}
		setItem({ ...item, config });
	};

	return (
		<AreaCheckbox
			title="Expiry"
			description="Purchased credits expire this long after each purchase. Every top-up gets its own expiry date."
			checked={expiry != null}
			onCheckedChange={(checked) =>
				setExpiry(checked ? { ...DEFAULT_EXPIRY } : null)
			}
		>
			<div className="space-y-2 w-xs max-w-full">
				<FormLabel>Expires after</FormLabel>
				<div className="flex items-center gap-2">
					<Input
						type="number"
						value={expiry?.length || ""}
						onChange={(e) => {
							const parsed = parseInt(e.target.value) || 1;
							setExpiry({
								...(expiry ?? DEFAULT_EXPIRY),
								length: Math.max(1, parsed),
							});
						}}
						className="w-16"
						placeholder="e.g. 2"
						onClick={(e) => e.stopPropagation()}
					/>
					<Select
						value={expiry?.duration ?? DEFAULT_EXPIRY.duration}
						onValueChange={(v) =>
							setExpiry({
								...(expiry ?? DEFAULT_EXPIRY),
								duration: v as EntitlementDuration,
							})
						}
						items={Object.fromEntries(
							Object.values(EntitlementDuration).map((duration) => [
								duration,
								duration,
							]),
						)}
					>
						<SelectTrigger
							className="w-32"
							onClick={(e) => e.stopPropagation()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.values(EntitlementDuration).map((duration) => (
								<SelectItem key={duration} value={duration}>
									{duration}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</AreaCheckbox>
	);
}
