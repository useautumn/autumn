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

export function useCreditDimensionFields({
	item,
	onChange,
	onRestrictDrafts,
	onRenameField,
}: {
	item: CreditSchemaItem;
	onChange: (item: CreditSchemaItem) => void;
	onRestrictDrafts: (isAllowed: (draft: CreditRateDraft) => boolean) => void;
	onRenameField: (rename: { from: string; to: string }) => void;
}) {
	const [draftValues, setDraftValues] = useState<DimensionValues>(() =>
		dimensionValues(item),
	);
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

	const renameField = (from: string, to: string) => {
		if (from === to || to in values) return;
		if (unnamedKeys.includes(from)) {
			removeUnnamedField(from);
			setDraftValues({ ...draftValues, [to]: [] });
			return;
		}
		setDraftValues(renameDimensionValuesKey({ values, from, to }));
		onRenameField({ from, to });
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
