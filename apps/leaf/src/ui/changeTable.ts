import type { buildPlanItemChangeDisplay } from "@autumn/render";
import type {
	CatalogConfigResourcePreview,
	CatalogPlanPreview,
	PlanUpdatePreviewItemChange,
	PreviewUpdateFeatureAction,
} from "@autumn/shared";
import { Table } from "chat";

type PlanItemChange = NonNullable<
	ReturnType<typeof buildPlanItemChangeDisplay>
>;
type Change = PlanItemChange["change"] | "Blocked" | "Conflict";

const changes = {
	Add: { label: "🟢 Add", order: 0 },
	Update: { label: "🟠 Update", order: 1 },
	Replace: { label: "🔵 Replace", order: 2 },
	Remove: { label: "🔴 Remove", order: 3 },
	Conflict: { label: "⚠️ Conflict", order: 4 },
	Blocked: { label: "⚠️ Blocked", order: 4 },
} as const satisfies Record<Change, { label: string; order: number }>;

type CatalogAction =
	| CatalogConfigResourcePreview["action"]
	| CatalogPlanPreview["action"]
	| PreviewUpdateFeatureAction;

const catalogActions = {
	create: "Add",
	created: "Add",
	update: "Update",
	updated: "Update",
	remove: "Remove",
	deleted: "Remove",
	conflict: "Conflict",
	skipped: null,
	none: null,
} as const satisfies Record<CatalogAction, Change | null>;

const catalogItemActions = {
	created: "Add",
	deleted: "Remove",
} as const satisfies Record<PlanUpdatePreviewItemChange["action"], Change>;

const getRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const getString = (value: unknown) =>
	typeof value === "string" && value.trim() ? value.trim() : null;

export const catalogActionToChange = (value: unknown): Change | null =>
	typeof value === "string" && value in catalogActions
		? catalogActions[value as CatalogAction]
		: null;

export const catalogItemActionToChange = (value: unknown) =>
	typeof value === "string" && value in catalogItemActions
		? catalogItemActions[value as PlanUpdatePreviewItemChange["action"]]
		: null;

export const changeTableRow = ({
	change,
	details,
	pricing = "—",
}: {
	change: Change;
	details: string;
	pricing?: string;
}) => ({ change, details, pricing });

export const planItemChangeTableRow = ({
	change,
	details,
	featureNames,
}: {
	change: PlanItemChange;
	details?: string | null;
	featureNames?: Record<string, unknown>;
}) => {
	const names = getRecord(featureNames?.[change.featureId ?? ""]);
	const feature =
		getString(change.includedText === "1" ? names.singular : names.plural) ??
		getString(names.name) ??
		change.featureId ??
		"Matching items";
	return changeTableRow({
		change: change.change,
		details:
			details ??
			(change.includedText ? `${change.includedText} ${feature}` : feature),
		pricing: change.pricingText ?? "—",
	});
};

export const changeTable = ({
	caption,
	rows,
}: {
	caption: string;
	rows: ReturnType<typeof changeTableRow>[];
}) =>
	Table({
		align: ["left", "left", "left"],
		caption,
		headers: ["Change", "Details", "Pricing"],
		rows: [...rows]
			.sort(
				(left, right) =>
					changes[left.change].order - changes[right.change].order,
			)
			.map(({ change, details, pricing }) => [
				changes[change].label,
				details,
				pricing,
			]),
	});

const stepStatusLabels = {
	applied: "🟢 Applied",
	failed: "🔴 Failed",
	pending: "⚪️ Not run",
} as const;

/** Which writes on a grouped card actually landed. Only worth rendering when
 * the group was partly applied — a clean run says so in one line. */
export const stepOutcomeTable = ({
	steps,
}: {
	steps: ReadonlyArray<{
		status: keyof typeof stepStatusLabels;
		summary: string;
	}>;
}) =>
	Table({
		align: ["left", "left"],
		caption: "Steps",
		headers: ["Result", "Action"],
		rows: steps.map(({ status, summary }) => [
			stepStatusLabels[status],
			summary,
		]),
	});

/** One operation applied to several targets — collapses the repeated sections
 * a fan-out would otherwise produce into a single scannable table. */
export const fanOutTable = ({
	caption,
	headers,
	rows,
}: {
	caption: string;
	headers: [string, string, string];
	rows: ReadonlyArray<[string, string, string]>;
}) =>
	Table({
		align: ["left", "left", "right"],
		caption,
		headers,
		rows: rows.map((row) => [...row]),
	});
