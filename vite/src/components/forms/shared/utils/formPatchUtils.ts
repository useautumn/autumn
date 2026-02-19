export const applyDefinedFormPatchFields = <
	TForm extends Record<string, unknown>,
	TField extends keyof TForm,
>({
	patch,
	fields,
	setFieldValue,
}: {
	patch: Partial<Pick<TForm, TField>>;
	fields: readonly TField[];
	setFieldValue: ({
		field,
		value,
	}: {
		field: TField;
		value: TForm[TField];
	}) => void;
}) => {
	for (const field of fields) {
		const value = patch[field];
		if (value === undefined) continue;
		setFieldValue({ field, value });
	}
};
