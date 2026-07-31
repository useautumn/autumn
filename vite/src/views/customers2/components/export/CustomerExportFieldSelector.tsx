import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	type CustomerExportField,
} from "@autumn/shared";
import { Button, Checkbox } from "@autumn/ui";

export function CustomerExportFieldSelector({
	selectedFields,
	onChange,
	errorMessage,
}: {
	selectedFields: CustomerExportField[];
	onChange: (fields: CustomerExportField[]) => void;
	errorMessage?: string;
}) {
	const toggleField = ({
		field,
		checked,
	}: {
		field: CustomerExportField;
		checked: boolean;
	}) => {
		onChange(
			checked
				? [...selectedFields, field]
				: selectedFields.filter((selected) => selected !== field),
		);
	};

	return (
		<div className="flex flex-col">
			<div className="mb-3 flex h-6 items-center justify-between gap-2">
				<h3 className="text-sub">Columns</h3>
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

			<div className="flex flex-col gap-1">
				{CUSTOMER_EXPORT_FIELD_ORDER.map((field) => {
					const checkboxId = `customer-export-field-${field}`;
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
			</div>

			{errorMessage ? (
				<p className="mt-3 pl-2 text-destructive text-xs">{errorMessage}</p>
			) : null}
		</div>
	);
}
