import { GroupedTabButton, IconButton, Input } from "@autumn/ui";
import { TrashIcon } from "@phosphor-icons/react";
import {
	type CreditRateRule,
	rateKindOf,
	setRateKind,
	setRuleCell,
} from "../utils/creditDimensionUtils";
import { CreditNumberInput } from "./CreditNumberInput";
import { CreditTierRows } from "./CreditTierRows";

const RATE_KIND_OPTIONS = [
	{ value: "flat", label: "Flat" },
	{ value: "tiered", label: "Tiered" },
];

interface CreditDimensionRateRowProps {
	fields: string[];
	rule: CreditRateRule;
	onChange: (rule: CreditRateRule) => void;
	onRemove: () => void;
}

/** One rate: a cell per field (blank = any), then its cost; tiered opens the ladder beneath. */
export function CreditDimensionRateRow({
	fields,
	rule,
	onChange,
	onRemove,
}: CreditDimensionRateRowProps) {
	const { dimension } = rule;
	const label = rule.name || "new rate";
	const isTiered = dimension.tier_behavior === "graduated";

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				{fields.map((field) => (
					<Input
						key={field}
						aria-label={`${label} ${field}`}
						className="flex-1 min-w-20"
						placeholder="any"
						value={dimension.match[field] ?? ""}
						onChange={(event) =>
							onChange(setRuleCell({ rule, field, value: event.target.value }))
						}
					/>
				))}
				<span className="text-tertiary-foreground text-xs shrink-0">
					{isTiered ? "tiered" : "costs"}
				</span>
				{!isTiered && (
					<>
						<CreditNumberInput
							ariaLabel={`${label} credit cost`}
							className="w-20 shrink-0"
							placeholder="eg. 1"
							value={dimension.credit_amount}
							onValueChange={(credit_amount) =>
								onChange({
									...rule,
									dimension: { ...dimension, credit_amount },
								})
							}
						/>
						<span className="text-tertiary-foreground text-xs">credits</span>
					</>
				)}
				<GroupedTabButton
					className="ml-auto shrink-0"
					value={rateKindOf(dimension)}
					onValueChange={(kind) =>
						onChange({
							...rule,
							dimension: setRateKind({
								dimension,
								kind: kind as "flat" | "tiered",
							}),
						})
					}
					options={RATE_KIND_OPTIONS}
				/>
				<IconButton
					aria-label={`Remove ${label}`}
					type="button"
					variant="muted"
					className="p-1 shrink-0 text-tertiary-foreground hover:text-red-500"
					icon={<TrashIcon size={10} />}
					onClick={onRemove}
				/>
			</div>

			{dimension.tier_behavior === "graduated" && (
				<div className="pl-4">
					<CreditTierRows
						item={dimension}
						onChange={(next) => onChange({ ...rule, dimension: next })}
					/>
				</div>
			)}
		</div>
	);
}
