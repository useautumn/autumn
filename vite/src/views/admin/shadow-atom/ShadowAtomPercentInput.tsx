import { useForm } from "@tanstack/react-form";
import { isValidPercent } from "../edge-config/rolloutTypes";
import { ShadowAtomPercentField } from "./ShadowAtomPercentField";

/** An org's percent, edited in place: saved on Enter or blur when it changed and is 0–100. */
export const ShadowAtomPercentInput = ({
	label,
	percent,
	onSave,
	disabled,
}: {
	label: string;
	percent: number;
	onSave: (percent: number) => void;
	disabled: boolean;
}) => {
	const form = useForm({
		defaultValues: { percent },
		onSubmit: ({ value }) => {
			if (value.percent !== percent && isValidPercent(value.percent))
				onSave(value.percent);
		},
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="percent">
				{(field) => (
					<ShadowAtomPercentField
						value={field.state.value}
						onChange={field.handleChange}
						onBlur={() => void form.handleSubmit()}
						disabled={disabled}
						label={label}
					/>
				)}
			</form.Field>
		</form>
	);
};
