import type { FilterValueInputProps } from "@/components/filters/types";
import { cn } from "@/lib/utils";
import { NumberValueInput } from "./NumberValueInput";
import { OptionsValueInput } from "./OptionsValueInput";
import { OPTION_HOOKS } from "./useValueOptions";

/** A feature and its quantity as `[feature_id, quantity]`. */
export const QuantityValueInput = ({
	values,
	onChange,
	className,
}: FilterValueInputProps) => {
	const [featureId = "", quantity = ""] = values;
	return (
		<div className={cn("flex min-w-0 gap-2", className)}>
			<OptionsValueInput
				className="min-w-0 flex-1"
				useOptions={OPTION_HOOKS.feature}
				values={featureId ? [featureId] : []}
				onChange={(next) => onChange([next.at(-1) ?? "", quantity])}
			/>
			<NumberValueInput
				className="w-14 shrink-0"
				values={quantity ? [quantity] : []}
				onChange={([next = ""]) => onChange([featureId, next])}
			/>
		</div>
	);
};
