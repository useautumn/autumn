import type { FilterValueInputProps } from "@/components/filters/types";
import { cn } from "@/lib/utils";
import { NumberValueInput } from "./NumberValueInput";
import { OptionsValueInput } from "./OptionsValueInput";

/** A feature and its quantity as `[feature_id, quantity]`. */
export const QuantityValueInput = ({
	values,
	onChange,
	className,
}: FilterValueInputProps) => {
	const [featureId = "", quantity = ""] = values;
	return (
		<div className={cn("flex gap-2", className)}>
			<OptionsValueInput
				className="flex-1"
				source="feature"
				values={featureId ? [featureId] : []}
				onChange={(next) => onChange([next.at(-1) ?? "", quantity])}
			/>
			<NumberValueInput
				className="w-20"
				values={quantity ? [quantity] : []}
				onChange={([next = ""]) => onChange([featureId, next])}
			/>
		</div>
	);
};
