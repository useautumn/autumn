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
	// Keyed, not counted: two blank rows must be distinguishable, or the same
	// name typed into both passes the duplicate guard twice.
	const [unnamedKeys, setUnnamedKeys] = useState<string[]>(() =>
		Object.keys(dimensionValues(item)).length === 0
			? [crypto.randomUUID()]
			: [],
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

	const addField = () => setUnnamedKeys([...unnamedKeys, crypto.randomUUID()]);

	const removeUnnamedField = (key: string) =>
		setUnnamedKeys(unnamedKeys.filter((current) => current !== key));

	const removeField = (field: string) => {
		const { [field]: _removed, ...allowed } = values;
		restrictTo(allowed);
	};

	/**
	 * `from` is a dimension name, or an unnamed row's key when it is being named.
	 * Rejecting a name already in use here — not just at the call site — is what
	 * stops two blank rows being given the same one.
	 */
	const renameField = (from: string, to: string) => {
		if (from === to || to in values) return;
		if (unnamedKeys.includes(from)) {
			removeUnnamedField(from);
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
		unnamedKeys,
		addField,
		removeField,
		removeUnnamedField,
		renameField,
		addValue,
		removeValue,
	};
}
