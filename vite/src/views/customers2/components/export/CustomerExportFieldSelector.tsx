import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	type CustomerExportField,
} from "@autumn/shared";
import { Button, Checkbox } from "@autumn/ui";
import { useId } from "react";

export function CustomerExportFieldSelector({
	selectedFields,
	onChange,
	errorMessage,
}: {
	selectedFields: CustomerExportField[];
	onChange: (fields: CustomerExportField[]) => void;
	errorMessage?: string;
}) {
	const fieldIdPrefix = useId();
	const errorId = `${fieldIdPrefix}-error`;
	const headingId = `${fieldIdPrefix}-heading`;

	const toggleField = ({
		field,
		checked,
	}: {
		field: CustomerExportField;
		checked: boolean;
	}) => {
		onChange(
			checked
				? CUSTOMER_EXPORT_FIELD_ORDER.filter(
						(candidate) =>
							candidate === field || selectedFields.includes(candidate),
					)
				: selectedFields.filter((selected) => selected !== field),
		);
	};

	return (
		<div className="flex flex-col">
			<div className="mb-3 flex h-6 items-center justify-between gap-2">
				<h3 className="text-sub" id={headingId}>
					Columns
				</h3>
				<div className="flex items-center gap-1">
					<Button
						variant="skeleton"
						size="sm"
						type="button"
						onClick={() => onChange([...CUSTOMER_EXPORT_FIELD_ORDER])}
					>
						Select all
					</Button>
					<Button
						variant="skeleton"
						size="sm"
						type="button"
						onClick={() => onChange([])}
					>
						Clear
					</Button>
				</div>
			</div>

			<fieldset
				aria-labelledby={headingId}
				aria-invalid={errorMessage ? true : undefined}
				aria-describedby={errorMessage ? errorId : undefined}
				className="flex min-w-0 flex-col gap-1"
			>
				{CUSTOMER_EXPORT_FIELD_ORDER.map((field) => {
					const checkboxId = `${fieldIdPrefix}-${field}`;
					return (
						<label
							key={field}
							htmlFor={checkboxId}
							className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-interactive-secondary/50"
						>
							<Checkbox
								id={checkboxId}
								checked={selectedFields.includes(field)}
								onCheckedChange={(checked) =>
									toggleField({ field, checked: checked === true })
								}
							/>
							<span className="text-checkbox-label">
								{CUSTOMER_EXPORT_FIELD_HEADERS[field]}
							</span>
						</label>
					);
				})}
			</fieldset>

			{errorMessage ? (
				<p
					id={errorId}
					role="alert"
					className="mt-3 pl-2 text-destructive text-xs"
				>
					{errorMessage}
				</p>
			) : null}
		</div>
	);
}
