import { UsageModel } from "autumn-js";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { ToggleButton } from "@/components/general/ToggleButton";
import { useProductItemContext } from "../../../ProductItemContext";

export const PrepaidToggle = () => {
	const { item, setItem } = useProductItemContext();

	return (
		<div className="min-w-40 max-w-40">
			<FieldLabel>{"\u00A0"}</FieldLabel>
			<div className="flex items-center gap-2 w-full">
				<ToggleButton
					disabled={item.interval === null}
					value={item.usage_model === UsageModel.Prepaid}
					setValue={() => {
						setItem({
							...item,
							usage_model:
								item.usage_model === UsageModel.Prepaid
									? UsageModel.PayPerUse
									: UsageModel.Prepaid,
						});
					}}
					buttonText="Prepaid"
					className="text-xs gap-2 text-t1 p-1"
				/>
				<InfoTooltip align="start">
					Prepaid features are paid for upfront, instead of at the end of the
					billing period. You can pass in a{" "}
					<span className="font-mono">
						<code>quantity</code>
					</span>{" "}
					field when purchasing the product.
				</InfoTooltip>
			</div>
		</div>
	);
};
