import { FormLabel, Switch } from "@autumn/ui";
import { FieldInfo } from "@/components/general/form/field-info";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export function SwitchField({
	label,
	className,
	hideFieldInfo,
}: {
	label: string;
	className?: string;
	hideFieldInfo?: boolean;
}) {
	const field = useFieldContext<boolean>();

	return (
		<div className={cn("flex flex-col", className)}>
			<div className="flex items-center justify-between">
				<FormLabel className="mb-0">{label}</FormLabel>
				<Switch
					checked={field.state.value}
					onCheckedChange={field.handleChange}
				/>
			</div>
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
