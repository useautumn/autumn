import { Input } from "@autumn/ui";

/** A 0–100 number box with a trailing %. */
export const ShadowAtomPercentField = ({
	value,
	onChange,
	disabled,
	label = "Percent",
	onBlur,
}: {
	value: number;
	onChange: (percent: number) => void;
	disabled: boolean;
	label?: string;
	onBlur?: () => void;
}) => (
	<div className="relative w-20">
		<Input
			type="number"
			min={0}
			max={100}
			step={1}
			value={value}
			onChange={(event) => onChange(Number(event.target.value))}
			onBlur={onBlur}
			aria-label={label}
			disabled={disabled}
			className="h-8 pr-6 font-mono text-xs tabular-nums"
		/>
		<span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-tertiary-foreground">
			%
		</span>
	</div>
);
