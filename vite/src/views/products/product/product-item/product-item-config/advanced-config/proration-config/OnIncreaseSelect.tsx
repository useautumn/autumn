import { OnIncrease, UsageModel } from "@autumn/shared";
import { useProductItemContext } from "../../../ProductItemContext";
import { ProrationSelect } from "./ProrationSelect";

const optionToText = (option: OnIncrease) => {
	switch (option) {
		case OnIncrease.BillImmediately:
			return "Pay full amount immediately";
		case OnIncrease.ProrateImmediately:
			return "Pay for prorated amount immediately";
		case OnIncrease.ProrateNextCycle:
			return "Add prorated amount to next invoice";
		case OnIncrease.BillNextCycle:
			return "Pay for full amount next cycle";
	}
};

export const OnIncreaseSelect = () => {
	const { item, setItem } = useProductItemContext();

	const value = item.config?.on_increase;

	const text =
		item.usage_model === UsageModel.PayPerUse
			? "On usage increase"
			: "On quantity increase";

	return (
		<div className="flex flex-col gap-2 w-full">
			<p className="text-t3">{text}</p>
			<ProrationSelect
				value={value || OnIncrease.ProrateImmediately}
				setValue={(value) =>
					setItem({ ...item, config: { ...item.config, on_increase: value } })
				}
				optionToText={optionToText}
				options={Object.values(OnIncrease).filter((o) => {
					if (
						item.usage_model === UsageModel.Prepaid &&
						o === OnIncrease.BillImmediately
					)
						return false;
					return true;
				})}
			/>
		</div>
	);
};
