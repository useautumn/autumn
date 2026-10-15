import { EDITOR_FIELDS } from "@autumn/shared/api/approvals/editor/index";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { LockSimpleIcon } from "@phosphor-icons/react";
import { FilterRowValue } from "@/components/filters/FilterRowValue";
import { operatorOptions } from "./ruleFieldRegistry";
import { fitOperatorToValues, type RuleRow } from "./ruleRowCodec";
import { RULE_VALUE_INPUTS } from "./values/ruleValueInputs";

const OPERATORS = operatorOptions(EDITOR_FIELDS.balance_create.feature);

/** Balances' Feature: always first, never removed, so amounts read in its unit. */
export const PinnedFeatureRow = ({
	row,
	label,
	onChange,
}: {
	row: RuleRow;
	label: string;
	onChange: (row: RuleRow) => void;
}) => (
	<div className="flex items-center gap-2.5">
		<span className="flex h-8 min-w-28 shrink-0 items-center px-3 text-sm">
			{label}
		</span>
		<Select
			value={row.operator}
			onValueChange={(operator) =>
				onChange({ ...row, operator: operator as RuleRow["operator"] })
			}
			items={OPERATORS}
		>
			<SelectTrigger className="h-8 min-w-16 shrink-0 px-3 text-sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{OPERATORS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
		<FilterRowValue
			valueInput="feature"
			valueInputs={RULE_VALUE_INPUTS}
			values={row.values}
			onChange={(values) =>
				onChange(
					fitOperatorToValues({
						row: { ...row, values },
						operators: EDITOR_FIELDS.balance_create.feature,
					}),
				)
			}
		/>
		<span className="flex size-6 shrink-0 items-center justify-center">
			<LockSimpleIcon
				aria-label="Feature is required"
				className="size-3.5 text-tertiary-foreground"
			/>
		</span>
	</div>
);
