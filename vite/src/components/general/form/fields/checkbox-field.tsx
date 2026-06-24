import { Checkbox } from "@autumn/ui";
import { useId } from "react";
import { FieldInfo } from "@/components/general/form/field-info";
import { useFieldContext } from "@/hooks/form/form-context";

export function CheckboxField({
	label,
	className,
	labelClassName,
	hideFieldInfo,
}: {
	label: string;
	className?: string;
	labelClassName?: string;
	hideFieldInfo?: boolean;
}) {
	const field = useFieldContext<boolean>();
	const id = useId();

	return (
		<div className={className}>
			<div className="flex items-center gap-2">
				<Checkbox
					id={id}
					checked={field.state.value}
					onCheckedChange={(checked) => field.handleChange(checked === true)}
				/>
				<label
					htmlFor={id}
					className={labelClassName ?? "text-sm text-tertiary-foreground"}
				>
					{label}
				</label>
			</div>
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
