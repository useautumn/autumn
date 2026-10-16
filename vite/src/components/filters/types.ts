import type { ComponentType } from "react";

export type FilterRow<
	TPath extends string = string,
	TOperator extends string = string,
> = {
	field: TPath;
	operator: TOperator;
	values: string[];
};

export type FilterRowGroup<
	TPath extends string = string,
	TOperator extends string = string,
> = {
	rules: FilterRow<TPath, TOperator>[];
};

export type FilterOperatorOption<TOperator extends string = string> = {
	value: TOperator;
	label: string;
	/** The operator is complete on its own, e.g. "has none". */
	hidesValue?: boolean;
};

/** Built-in inputs, or a key into the builder's `valueInputs`. */
export type FilterValueInput = "none" | "boolean" | "text" | (string & {});

export type FilterValueInputProps = {
	values: string[];
	onChange: (values: string[]) => void;
	className?: string;
};

export type FilterValueInputs = Record<
	string,
	ComponentType<FilterValueInputProps>
>;

export type FilterField<
	TFilter,
	TPath extends string = string,
	TOperator extends string = string,
> = {
	path: TPath;
	label: string;
	valueInput: FilterValueInput;
	operators: FilterOperatorOption<TOperator>[];
	/** The row's fragment of the filter, or null when it has nothing to add. */
	toFilter: (row: FilterRow<TPath, TOperator>) => TFilter | null;
	fromFilter: (filter: TFilter) => FilterRow<TPath, TOperator> | null;
};

export type FilterRegistry<
	TFilter,
	TPath extends string = string,
	TOperator extends string = string,
> = {
	fields: FilterField<TFilter, TPath, TOperator>[];
	defaultPath: TPath;
	getField: (path: TPath) => FilterField<TFilter, TPath, TOperator>;
	createRow: (params: { path: TPath }) => FilterRow<TPath, TOperator>;
	nextRow: (params: {
		rows: FilterRow<TPath, TOperator>[];
	}) => FilterRow<TPath, TOperator>;
};
