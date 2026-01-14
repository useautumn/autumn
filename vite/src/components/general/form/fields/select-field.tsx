import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useFieldContext } from "@/hooks/form/form-context";

export type SelectFieldOption = {
	label: string;
	value: string;
	disabledValue?: string;
};

export function SelectField({
	label,
	options,
	placeholder,
	textAfter,
	className,
	hideFieldInfo,
	selectValueAfter,
}: {
	label: string;
	options: SelectFieldOption[];
	placeholder: string;
	textAfter?: string;
	className?: string;
	hideFieldInfo?: boolean;
	selectValueAfter?: React.ReactNode;
}) {
	const field = useFieldContext<string>();

	return (
		<div className={className}>
			<Label>{label}</Label>
			<Select value={field.state.value} onValueChange={field.handleChange}>
				<SelectTrigger className="w-full h-7">
					<div className="flex items-center gap-2">
						<SelectValue placeholder={placeholder} />
						{selectValueAfter && selectValueAfter}
					</div>
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem
							key={option.value}
							value={option.value}
							className={
								option.disabledValue ? "text-t4 pointer-events-none" : ""
							}
						>
							{option.label}
							{option.disabledValue && (
								<span className="text-xs text-t3 bg-muted px-1 py-0 rounded-md">
									{option.disabledValue}
								</span>
							)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{textAfter && (
				<section
					aria-live="polite"
					className="mt-2 text-muted-foreground text-xs"
				>
					{textAfter}
				</section>
			)}
			{!hideFieldInfo && <FieldInfo field={field} />}
		</div>
	);
}
