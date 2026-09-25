import { Button, Input } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { isValidPercent, PERCENT_PRESETS } from "./rolloutTypes";

const PresetControl = ({
	value,
	onChange,
}: {
	value: number;
	onChange: (percent: number) => void;
}) => (
	<div className="flex overflow-clip rounded-md border">
		{PERCENT_PRESETS.map((preset) => (
			<button
				type="button"
				key={preset}
				onClick={() => onChange(preset)}
				aria-pressed={value === preset}
				className={cn(
					"h-8 border-r px-2.5 font-mono text-xs tabular-nums transition-colors last:border-r-0",
					value === preset
						? "bg-primary/10 text-foreground"
						: "text-tertiary-foreground hover:bg-interactive-secondary-hover hover:text-foreground",
				)}
			>
				{preset}
			</button>
		))}
	</div>
);

/** Pick a preset or type a number, then apply; the change lands after the settle window. */
export const RolloutPercentForm = ({
	current,
	onApply,
	isSaving,
	applyLabel = "Apply",
}: {
	current: number;
	onApply: ({ percent }: { percent: number }) => void;
	isSaving: boolean;
	applyLabel?: string;
}) => {
	const form = useForm({
		defaultValues: { percent: current },
		onSubmit: ({ value }) => onApply({ percent: value.percent }),
	});

	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field
				name="percent"
				validators={{
					onChange: ({ value }) =>
						isValidPercent(value) ? undefined : "0 to 100, whole numbers",
				}}
			>
				{(field) => (
					<fieldset
						className="flex flex-wrap items-center gap-2"
						disabled={isSaving}
					>
						<PresetControl
							value={field.state.value}
							onChange={field.handleChange}
						/>
						<div className="relative">
							<Input
								type="number"
								min={0}
								max={100}
								step={1}
								value={field.state.value}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								className="h-8 w-20 pr-6 font-mono text-xs tabular-nums"
								aria-label="Percent"
							/>
							<span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-tertiary-foreground">
								%
							</span>
						</div>
						<form.Subscribe
							selector={(state) =>
								[state.values.percent, state.canSubmit] as const
							}
						>
							{([percent, canSubmit]) => (
								<Button
									type="submit"
									size="sm"
									isLoading={isSaving}
									disabled={!canSubmit || percent === current}
								>
									{applyLabel}
								</Button>
							)}
						</form.Subscribe>
						{field.state.meta.errors.length > 0 && (
							<p role="alert" className="basis-full text-tiny text-destructive">
								{field.state.meta.errors.join(" ")}
							</p>
						)}
					</fieldset>
				)}
			</form.Field>
		</form>
	);
};
