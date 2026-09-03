import type { UsageAlertBasis } from "@autumn/shared";
import {
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useId } from "react";
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
}) => {
	const descriptionId = useId();
	return (
		<div>
			<FormLabel>Measured against</FormLabel>
			<Select
				value={value}
				onValueChange={(next) => onChange(next as UsageAlertBasis)}
				items={options}
			>
				<SelectTrigger
					className="w-full"
					aria-label="Measured against"
					aria-describedby={descriptionId}
				>
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
			<p id={descriptionId} className="mt-1 text-tertiary-foreground text-xs">
				{USAGE_ALERT_BASIS_DESCRIPTIONS[value]}
			</p>
		</div>
	);
};
