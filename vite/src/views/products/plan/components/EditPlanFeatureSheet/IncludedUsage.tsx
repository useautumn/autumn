import { Infinite } from "@autumn/shared";
import { InfinityIcon } from "@phosphor-icons/react";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function IncludedUsage() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	const includedUsage = item.included_usage;

	return (
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
						icon={<InfinityIcon />}
						iconOrientation="center"
						variant="muted"
						size="default"
						checked={includedUsage === Infinite}
						onCheckedChange={(checked) =>
							setItem({
								...item,
								included_usage: checked ? Infinite : 1,
							})
						}
						className="py-1 px-2"
					/>
				</div>
			</div>
		</div>
	);
}
