import type { CreditSchemaItem } from "@autumn/shared";
import { useMemo, useState } from "react";
import {
	type CreditRateRule,
	createRateRule,
	dimensionFields,
	rateRules,
	withFields,
	withRateRules,
} from "../utils/creditDimensionUtils";

/**
 * Fields are the union of the rules' match keys; a field added before any rule
 * uses it lives in local state until then, so it is never lost on re-render.
 */
export function useCreditDimensionEditor({
	item,
	onChange,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
}) {
	const [draftFields, setDraftFields] = useState<string[]>([]);
	const usedFields = dimensionFields(item);
	const fields = Array.from(new Set([...usedFields, ...draftFields]));
	const rules = useMemo(() => rateRules(item), [item.dimensions]);

	const commit = (next: CreditRateRule[]) =>
		onChange(withRateRules({ item, rules: next }));

	const setFields = (next: string[]) => {
		setDraftFields(next.filter((field) => !usedFields.includes(field)));
		onChange(withFields({ item, fields: next }));
	};

	return {
		fields,
		rules,
		addField: (field: string) => setFields([...fields, field]),
		removeField: (field: string) =>
			setFields(fields.filter((current) => current !== field)),
		addRule: () => commit([...rules, createRateRule()]),
		setRule: (index: number, rule: CreditRateRule) =>
			commit(rules.map((r, i) => (i === index ? rule : r))),
		removeRule: (index: number) => commit(rules.filter((_, i) => i !== index)),
	};
}
