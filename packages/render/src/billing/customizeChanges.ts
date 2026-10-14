import { formatMoney } from "../format.js";
import { asRecord, getArray, getNumber, getString } from "../records.js";
import { itemMatchesFilter } from "./itemMatchesFilter.js";

type Shape = Record<string, unknown>;

export type CustomizeChange =
	| { kind: "add" | "remove"; subject: "price"; price: Shape }
	| { kind: "add" | "remove"; subject: "free_trial"; trial: Shape }
	| { kind: "add" | "remove"; subject: "item"; item: Shape };

type ChangeKind = CustomizeChange["kind"];

const records = (value: unknown): Shape[] =>
	getArray(value).flatMap((entry) => {
		const record = asRecord(entry);
		return record ? [record] : [];
	});

const currentItems = (currentPlan: unknown): Shape[] =>
	records(asRecord(currentPlan)?.items);

const overrideChanges = ({
	currentPlan,
	customize,
	field,
	toChange,
}: {
	currentPlan: unknown;
	customize: Shape;
	field: string;
	toChange: (kind: ChangeKind, value: Shape) => CustomizeChange;
}): CustomizeChange[] => {
	if (!(field in customize)) return [];
	const current = asRecord(asRecord(currentPlan)?.[field]);
	const next = asRecord(customize[field]);
	return [
		...(current ? [toChange("remove", current)] : []),
		...(next ? [toChange("add", next)] : []),
	];
};

const removedItems = ({
	currentPlan,
	filters,
}: {
	currentPlan: unknown;
	filters: unknown;
}): Shape[] =>
	getArray(filters).flatMap((filter) => {
		const matches = currentItems(currentPlan).filter((item) =>
			itemMatchesFilter({ filter, item }),
		);
		if (matches.length) return matches;
		const filterRecord = asRecord(filter);
		return filterRecord ? [filterRecord] : [];
	});

const itemChanges = ({
	currentPlan,
	customize,
}: {
	currentPlan: unknown;
	customize: Shape;
}): CustomizeChange[] => {
	const replacing = Array.isArray(customize.items);
	const removed = replacing
		? currentItems(currentPlan)
		: removedItems({ currentPlan, filters: customize.remove_items });
	const added = records(replacing ? customize.items : customize.add_items);
	return [
		...removed.map((item) => ({
			kind: "remove" as const,
			subject: "item" as const,
			item,
		})),
		...added.map((item) => ({
			kind: "add" as const,
			subject: "item" as const,
			item,
		})),
	];
};

export const customizeWithFreeTrial = (request: unknown): unknown => {
	const record = asRecord(request);
	if (!record) return undefined;
	const customize = asRecord(record.customize);
	if (record.free_trial === undefined) return record.customize;
	return {
		...customize,
		free_trial: customize?.free_trial ?? record.free_trial,
	};
};

export const customizeNeedsCurrentPlan = (customize: unknown): boolean => {
	const patch = asRecord(customize);
	if (!patch) return false;
	return (
		"price" in patch ||
		"free_trial" in patch ||
		Array.isArray(patch.items) ||
		Array.isArray(patch.remove_items)
	);
};

export const currentPlanFromPreview = <Plan>({
	outgoing,
	planId,
}: {
	outgoing:
		| readonly { plan?: Plan | undefined; plan_id?: unknown }[]
		| undefined;
	planId?: string | null;
}): Plan | null => {
	const changes = (outgoing ?? []).filter(
		(change) => change.plan !== undefined,
	);
	const change = planId
		? changes.find(({ plan_id }) => plan_id === planId)
		: changes[0];
	return change?.plan ?? null;
};

export const buildCustomizeChanges = ({
	currentPlan,
	customize,
}: {
	currentPlan: unknown;
	customize: unknown;
}): CustomizeChange[] => {
	const patch = asRecord(customize);
	if (!patch) return [];
	const overrides = [
		...overrideChanges({
			currentPlan,
			customize: patch,
			field: "price",
			toChange: (kind, price) => ({ kind, subject: "price", price }),
		}),
		...overrideChanges({
			currentPlan,
			customize: patch,
			field: "free_trial",
			toChange: (kind, trial) => ({ kind, subject: "free_trial", trial }),
		}),
	];
	const items = itemChanges({ currentPlan, customize: patch });
	const only = (kind: ChangeKind) => (change: CustomizeChange) =>
		change.kind === kind;
	return [
		...overrides.filter(only("remove")),
		...items.filter(only("remove")),
		...overrides.filter(only("add")),
		...items.filter(only("add")),
	];
};

export const customPriceText = (value: unknown): string | null => {
	const price = asRecord(value);
	const amount = getNumber(price?.amount);
	if (price === null || amount === null) return null;
	const interval = getString(price.interval);
	const intervalCount = getNumber(price.interval_count);
	const cadence = interval
		? ` per ${intervalCount && intervalCount > 1 ? `${intervalCount} ${interval}s` : interval}`
		: "";
	return `${formatMoney({ amount, currency: getString(price.currency) })}${cadence}`;
};

export const freeTrialText = (value: unknown): string | null => {
	const trial = asRecord(value);
	const length = getNumber(trial?.duration_length);
	if (trial === null || length === null) return null;
	const unit = getString(trial.duration_type) ?? "month";
	return `${length}-${unit} free trial`;
};
