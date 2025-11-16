import type { AnyFieldApi } from "@tanstack/react-form";

export function FieldInfo({ field }: { field: AnyFieldApi }) {
	return (
		<>
			{field.state.meta.isTouched && !field.state.meta.isValid ? (
				<em className="text-destructive text-xs">
					{field.state.meta.errors.map((error) => error.message).join(", ")}
				</em>
			) : null}
		</>
	);
}
