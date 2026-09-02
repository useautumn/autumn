import { formatMoney } from "../format.js";
import { asRecord, getArray, getNumber, getString } from "../records.js";
import { itemMatchesFilter } from "./itemMatchesFilter.js";

type Shape = Record<string, unknown>;

/** One customer-specific change to a plan. Every change is an add or a
 * remove: the verb is a property of the diff against the current plan, never
 * a label chosen by a surface. Removes carry what is actually being removed. */
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

/** A single-valued override (price, free trial): present in the request means
 * "set to this", null means "remove". Diffed against the current plan's value
 * so a change reads as a remove of the old and an add of the new. */
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

/** `remove_items` entries are filters; each resolves to the current items it
 * matches so the row shows the quantity being removed. An unmatched filter
 * still names its feature rather than vanishing. */
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
	// `items` is PUT-style: the new list replaces every current item.
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

/** The customer-specific terms of a billing action as adds and removes
 * against the current plan. Removes precede adds so a table reads old → new. */
/** The trial is documented at the top level of a billing request and defined
 * inside `customize`; the server honours both, so previews must too. */
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

/** Whether diffing this customize needs the current plan as its baseline.
 * Kept beside buildCustomizeChanges so the two can't drift apart. */
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

/** The plan a customize is diffed against: the preview's outgoing plan holds
 * the customer's live terms, which differ from the catalog once customized. */
export const currentPlanFromPreview = <Plan>({
	outgoing,
	planId,
}: {
	outgoing:
		| readonly { plan?: Plan | undefined; plan_id?: unknown }[]
		| undefined;
	/** The plan being customized, when the write names one. */
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
	/** The plan being changed (`currentPlanFromPreview`), or null for a fresh
	 * attach where nothing is current. */
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

/** "$80.00 per month" for a base-price shape, or null when there is no amount. */
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

/** "14-day free trial" for a trial shape, or null when there is no length. */
export const freeTrialText = (value: unknown): string | null => {
	const trial = asRecord(value);
	const length = getNumber(trial?.duration_length);
	if (trial === null || length === null) return null;
	const unit = getString(trial.duration_type) ?? "month";
	return `${length}-${unit} free trial`;
};
