import { Check, ChevronDown } from "lucide-react";
import { FieldInfo } from "@/components/general/form/field-info";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useFieldContext } from "@/hooks/form/form-context";
import { cn } from "@/lib/utils";

export type SelectFieldOption = {
	label: string;
	value: string;
};

export function SelectField({
	label,
	options,
	placeholder,
	textAfter,
	className,
}: {
	label: string;
	options: SelectFieldOption[];
	placeholder: string;
	textAfter?: string;
	className?: string;
}) {
	const field = useFieldContext<string>();
	const selectedOption = options.find(
		(option) => option.value === field.state.value,
	);
	const displayText = selectedOption ? selectedOption.label : placeholder;

	return (
		<div className={className}>
			<Label>{label}</Label>
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						role="combobox"
						size="default"
						className="justify-between font-normal w-full"
					>
						<span className="truncate">{displayText}</span>
						<ChevronDown className="h-4 w-4 shrink-0 text-t3" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-full p-1" align="start">
					{options.map((option) => {
						const isSelected = field.state.value === option.value;
						return (
							<div
								key={option.value}
								className={cn(
									"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
									isSelected && "bg-accent/50",
								)}
								onClick={() => field.handleChange(option.value)}
							>
								<Check
									className={cn(
										"mr-2 h-4 w-4",
										isSelected ? "opacity-100" : "opacity-0",
									)}
								/>
								<span>{option.label}</span>
							</div>
						);
					})}
				</PopoverContent>
			</Popover>
			{textAfter && (
				<section
					aria-live="polite"
					className="mt-2 text-muted-foreground text-xs"
				>
					{textAfter}
				</section>
			)}
			<FieldInfo field={field} />
		</div>
	);
}
