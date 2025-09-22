import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { Infinite } from "@autumn/shared";
import { useProductItemContext } from "../../ProductItemContext";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { itemIsUnlimited } from "@/utils/product/productItemUtils";
import { isFeaturePriceItem } from "@/utils/product/getItemType";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";

export const IncludedUsage = () => {
	const { item, setItem } = useProductItemContext();
	const isFeaturePrice = isFeaturePriceItem(item);

	return (
		<div className="w-full transition-all duration-400 ease-in-out whitespace-nowrap">
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
	);
};
