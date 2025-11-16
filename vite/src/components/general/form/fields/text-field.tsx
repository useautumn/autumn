import { FieldInfo } from "@/components/general/form/field-info";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldContext } from "@/hooks/form/form-context";
import SmallSpinner from "../../SmallSpinner";

export function TextField({
	label,
	type,
	placeholder,
	textAfter,
}: {
	label: string;
	type: HTMLInputElement["type"];
	placeholder?: string;
	textAfter?: string;
}) {
	const field = useFieldContext<string>();
	return (
		<div className="*:not-first:mt-2">
			<Label>{label}</Label>
			<div className="relative">
				<Input
					className="text-sm"
					onChange={(e) => field.handleChange(e.target.value)}
					placeholder={placeholder}
					type={type}
					value={field.state.value}
				/>
				{field.state.meta.isValidating && (
					<div className="pointer-events-none absolute inset-y-0 end-0 flex items-center justify-center pe-3 text-muted-foreground/80 peer-disabled:opacity-50">
						<SmallSpinner aria-hidden="true" size={16} />
					</div>
				)}
			</div>
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
