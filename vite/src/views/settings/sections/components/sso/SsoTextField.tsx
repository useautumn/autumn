import { FormLabel, Input } from "@autumn/ui";
import type { AnyFieldApi } from "@tanstack/react-form";
import { FieldInfo } from "@/components/general/form/field-info";

export const SsoTextField = ({
	field,
	label,
	description,
	placeholder,
	type = "text",
}: {
	field: AnyFieldApi;
	label: string;
	description: string;
	placeholder?: string;
	type?: "text" | "password";
}) => (
	<div className="flex flex-col">
		<FormLabel>
			<label className="text-muted-foreground" htmlFor={field.name}>
				{label}
			</label>
		</FormLabel>
		<Input
			autoComplete={type === "password" ? "new-password" : "off"}
			id={field.name}
			onBlur={field.handleBlur}
			onChange={(e) => field.handleChange(e.target.value)}
			placeholder={placeholder}
			spellCheck={false}
			type={type}
			value={field.state.value}
		/>
		<p className="mt-1 text-xs text-tertiary-foreground">{description}</p>
		<FieldInfo field={field} />
	</div>
);
