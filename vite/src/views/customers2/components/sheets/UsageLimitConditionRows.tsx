import { USAGE_LIMIT_FILTER_MAX_KEYS } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { PlusIcon, XIcon } from "lucide-react";
import { SuggestionInput } from "./SuggestionInput";
import type { CustomerPropertySuggestions } from "./useCustomerPropertyKeys";

export type UsageLimitCondition = {
	key: string;
	value: string;
};

const EMPTY_SUGGESTIONS: CustomerPropertySuggestions = {
	propertyKeys: [],
	valuesByKey: {},
};

/** Property equality conditions for a filtered usage limit (AND across rows). */
export function UsageLimitConditionRows({
	conditions,
	onChange,
	suggestions = EMPTY_SUGGESTIONS,
	maxConditions = USAGE_LIMIT_FILTER_MAX_KEYS,
}: {
	conditions: UsageLimitCondition[];
	onChange: (conditions: UsageLimitCondition[]) => void;
	/** Observed keys/values for suggestions and typo warnings (free text always allowed). */
	suggestions?: CustomerPropertySuggestions;
	maxConditions?: number;
}) {
	const { propertyKeys, valuesByKey } = suggestions;

	const updateCondition = (
		index: number,
		patch: Partial<UsageLimitCondition>,
	) => {
		onChange(
			conditions.map((condition, i) =>
				i === index ? { ...condition, ...patch } : condition,
			),
		);
	};

	return (
		<div className="flex flex-col gap-2">
			{conditions.map((condition, index) => {
				return (
					<div className="flex items-center gap-2" key={`condition-${index}`}>
						<SuggestionInput
							onChange={(key) => updateCondition(index, { key })}
							options={propertyKeys}
							placeholder="Property"
							value={condition.key}
						/>
						<span className="text-tertiary-foreground text-xs">=</span>
						<SuggestionInput
							onChange={(value) => updateCondition(index, { value })}
							options={valuesByKey[condition.key.trim()] ?? []}
							placeholder="Value"
							value={condition.value}
						/>
						<Button
							onClick={() => onChange(conditions.filter((_, i) => i !== index))}
							size="icon"
							variant="ghost"
						>
							<XIcon className="size-4" />
						</Button>
					</div>
				);
			})}
			{conditions.length < maxConditions && (
				<Button
					className="w-fit gap-2 font-medium"
					onClick={() => onChange([...conditions, { key: "", value: "" }])}
					size="mini"
					variant="secondary"
				>
					<PlusIcon className="size-3.5" />
					Add condition
				</Button>
			)}
		</div>
	);
}
