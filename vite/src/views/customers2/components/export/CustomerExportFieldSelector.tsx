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
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="font-medium text-sm">Columns</span>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onClick={() => onChange([...CUSTOMER_EXPORT_FIELD_ORDER])}
					>
						Select all
					</Button>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onClick={() => onChange([])}
					>
						Clear
					</Button>
				</div>
			</div>

			<div className="flex flex-col gap-2">
				{CUSTOMER_EXPORT_FIELD_ORDER.map((field) => {
					const checkboxId = `customer-export-field-${field}`;
					return (
						<div key={field} className="flex items-center gap-2">
							<Checkbox
								id={checkboxId}
								checked={selectedFields.includes(field)}
								onCheckedChange={(checked) =>
									toggleField({ field, checked: checked === true })
								}
							/>
							<label className="text-sm" htmlFor={checkboxId}>
								{CUSTOMER_EXPORT_FIELD_HEADERS[field]}
							</label>
						</div>
					);
				})}
			</div>

			{errorMessage ? (
				<p className="text-destructive text-xs">{errorMessage}</p>
			) : null}
		</div>
	);
}
