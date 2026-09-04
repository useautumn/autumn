import type { CreditSchemaItem } from "@autumn/shared";
import { useMemo, useState } from "react";
import {
	type CreditRateDraft,
	type DimensionValues,
	dimensionValues,
	isMatchAllowed,
	mergeDimensionValues,
	renameDimensionValuesKey,
	withAllowedValues,
	withRenamedField,
} from "../utils/creditDimensionUtils";
import { without } from "../utils/listUtils";

/**
 * The dimensions and their values. Seeded from what is saved so a dimension
 * outlives the last rule using it — deleting rates must never delete the
 * dimension they matched on. Unnamed rows have no key to live under yet, so
 * they are counted separately until named; a fresh item starts with one,
 * since configuring dimensions always begins by naming one.
 */
export function useCreditDimensionFields({
	item,
	onChange,
	onRestrictDrafts,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
	onRestrictDrafts: (isAllowed: (draft: CreditRateDraft) => boolean) => void;
}) {
	const [draftValues, setDraftValues] = useState<DimensionValues>(() =>
		dimensionValues(item),
	);
	const [unnamedFields, setUnnamedFields] = useState(() =>
		Object.keys(dimensionValues(item)).length === 0 ? 1 : 0,
	);

	const values = useMemo(
		() => mergeDimensionValues(draftValues, dimensionValues(item)),
		[item.dimensions, item.multipliers, draftValues],
	);

	const restrictTo = (allowed: DimensionValues) => {
		setDraftValues(allowed);
		onRestrictDrafts((draft) => isMatchAllowed(draft.match, allowed));
		onChange(withAllowedValues({ item, allowed }));
	};

	const addField = () => setUnnamedFields(unnamedFields + 1);

	const removeUnnamedField = () =>
		setUnnamedFields(Math.max(unnamedFields - 1, 0));

	const removeField = (field: string) => {
		const { [field]: _removed, ...allowed } = values;
		restrictTo(allowed);
	};

	const renameField = (from: string, to: string) => {
		// A name already in use would merge two dimensions silently.
		if (from === to || to in values) return;
		if (from === "") {
			removeUnnamedField();
			setDraftValues({ ...draftValues, [to]: [] });
			return;
		}
		setDraftValues(renameDimensionValuesKey({ values, from, to }));
		onChange(withRenamedField({ item, from, to }));
	};

	const addValue = (field: string, value: string) =>
		setDraftValues((current) => ({
			...current,
			[field]: [...(current[field] ?? []), value],
		}));

	const removeValue = (field: string, value: string) =>
		restrictTo({ ...values, [field]: without(values[field], value) });

	return {
		values,
		fields: Object.keys(values),
		unnamedFields,
		addField,
		removeField,
		removeUnnamedField,
		renameField,
		addValue,
		removeValue,
	};
}
