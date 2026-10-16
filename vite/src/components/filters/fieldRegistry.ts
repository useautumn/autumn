import type { FilterField, FilterRegistry, FilterRow } from "./types";

export function createFieldRegistry<
	TFilter,
	TPath extends string = string,
	TOperator extends string = string,
>({
	fields,
	defaultPath,
}: {
	fields: FilterField<TFilter, TPath, TOperator>[];
	defaultPath: TPath;
}): FilterRegistry<TFilter, TPath, TOperator> {
	const fieldsByPath = new Map(fields.map((field) => [field.path, field]));

	const getField = (path: TPath) => {
		const field = fieldsByPath.get(path);
		if (!field) throw new Error(`Unknown filter field: ${path}`);
		return field;
	};

	const createRow = ({ path }: { path: TPath }) => ({
		field: path,
		operator: getField(path).operators[0].value,
		values: [],
	});

	const nextRow = ({ rows }: { rows: FilterRow<TPath, TOperator>[] }) => {
		const used = new Set(rows.map((row) => row.field));
		const unused = fields.find((field) => !used.has(field.path));
		return createRow({ path: unused?.path ?? defaultPath });
	};

	return { fields, defaultPath, getField, createRow, nextRow };
}

/** ANDs the rows: each row's fragment is merged in row order. */
export function rowsToFilter<
	TFilter,
	TPath extends string,
	TOperator extends string,
>({
	registry,
	rows,
}: {
	registry: FilterRegistry<TFilter, TPath, TOperator>;
	rows: FilterRow<TPath, TOperator>[];
}): TFilter {
	return Object.assign(
		{},
		...rows.map((row) => registry.getField(row.field).toFilter(row)),
	);
}

/** One row per field the filter sets, in registry order. */
export function filterToRows<
	TFilter,
	TPath extends string,
	TOperator extends string,
>({
	registry,
	filter,
}: {
	registry: FilterRegistry<TFilter, TPath, TOperator>;
	filter: TFilter;
}): FilterRow<TPath, TOperator>[] {
	return registry.fields.flatMap((field) => field.fromFilter(filter) ?? []);
}
