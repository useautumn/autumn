import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { useFieldContext } from "@/hooks/form/form-context";

export function AreaCheckboxField({
	title,
	description,
	disabled,
	disabledReason,
	children,
}: {
	title: string;
	description?: string;
	disabled?: boolean;
	disabledReason?: string;
	children?: React.ReactNode;
}) {
	const field = useFieldContext<boolean>();

	return (
		<AreaCheckbox
			title={title}
			description={description}
			checked={field.state.value}
			onCheckedChange={(checked) => field.handleChange(checked)}
			disabled={disabled}
			disabledReason={disabledReason}
		>
			{children}
		</AreaCheckbox>
	);
}
