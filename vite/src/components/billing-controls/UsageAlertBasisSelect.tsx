import type { UsageAlertBasis } from "@autumn/shared";
import {
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import {
	USAGE_ALERT_BASIS_DESCRIPTIONS,
	type UsageAlertBasisOption,
} from "./usageAlertBasisOptions";

export const UsageAlertBasisSelect = ({
	value,
	options,
	onChange,
}: {
	value: UsageAlertBasis;
	options: readonly UsageAlertBasisOption[];
	onChange: (basis: UsageAlertBasis) => void;
}) => (
	<div>
		<FormLabel>Measured against</FormLabel>
		<Select
			value={value}
			onValueChange={(next) => onChange(next as UsageAlertBasis)}
			items={Object.fromEntries(
				options.map((option) => [option.value, option.label]),
			)}
		>
			<SelectTrigger className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
		<p className="mt-1 text-tertiary-foreground text-xs">
			{USAGE_ALERT_BASIS_DESCRIPTIONS[value]}
		</p>
	</div>
);
