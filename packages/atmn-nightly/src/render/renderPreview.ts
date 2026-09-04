import chalk from "chalk";

/**
 * Headless rendering only, for now — the shape a CI log or a piped terminal
 * wants. The interactive view comes later and reads the same fields; nothing
 * here computes anything, it only reports what preview returned.
 */

type ChangeAction = "create" | "update" | "delete" | "skip" | string;

type PreviewChange = {
	action?: ChangeAction;
	name?: string;
};

type PriceLite = {
	amount?: number;
	interval?: string;
	intervalCount?: number;
	tiers?: unknown[];
} | null;

type TrialLite = { durationLength?: number; durationType?: string } | null;

type ItemLite = {
	featureId?: string;
	included?: number;
	unlimited?: boolean;
	price?: PriceLite;
	display?: { primaryText?: string; secondaryText?: string } | null;
};

type PlanItemChangeLite = {
	action?: string;
	featureId?: string;
	item?: ItemLite;
};

type PlanLicenseChangeLite = {
	action?: string;
	licensePlanId?: string;
	version?: number;
	included?: number;
	prepaidOnly?: boolean;
	previousAttributes?: Record<string, unknown> | null;
	planChange?: PlanChangeLite | null;
};

/** The server's diff for one plan row; absent on creates and deletes. */
type PlanChangeLite = {
	previousAttributes?: Record<string, unknown> | null;
	priceChange?: { previous?: PriceLite; current?: PriceLite };
	freeTrialChange?: { previous?: TrialLite; current?: TrialLite };
	itemChanges?: PlanItemChangeLite[];
	licenseChanges?: PlanLicenseChangeLite[];
};

// Fixture casing, not wire: the client recases every response on the way in,
// so this renders `featureId`, never `feature_id`. One exception: a feature's
// `previousAttributes` is a frozen record and keeps its snake_case keys.
type FeatureChange = PreviewChange & {
	featureId?: string;
	previousAttributes?: Record<string, unknown> | null;
};
type PlanChange = PreviewChange & {
	planId?: string;
	version?: number;
	planChange?: PlanChangeLite | null;
};

export type CatalogPreview = {
	features?: FeatureChange[];
	plans?: PlanChange[];
	migrations?: { id?: string }[];
};

const MARKERS: Record<
	string,
	{ symbol: string; paint: (s: string) => string }
> = {
	create: { symbol: "+", paint: chalk.green },
	update: { symbol: "~", paint: chalk.yellow },
	delete: { symbol: "-", paint: chalk.red },
};

/** The spec's enum is create | update | delete | skip | none. */
const APPLIED_ACTIONS = new Set(["create", "update", "delete"]);

/** Nested changes speak in the past tense (created, updated, removed). */
const NESTED_ACTIONS: Record<string, string> = {
	created: "create",
	updated: "update",
	deleted: "delete",
	removed: "delete",
};

const marker = (action: ChangeAction | undefined) =>
	MARKERS[NESTED_ACTIONS[action ?? ""] ?? action ?? ""] ?? {
		symbol: "?",
		paint: chalk.dim,
	};

const line = ({
	action,
	id,
	label,
	indent = "  ",
}: {
	action: ChangeAction | undefined;
	id: string;
	label?: string;
	indent?: string;
}): string => {
	const { symbol, paint } = marker(action);
	const suffix = label && label !== id ? chalk.dim(`  ${label}`) : "";
	return `${indent}${paint(`${symbol} ${id}`)}${suffix}`;
};

const formatValue = (value: unknown): string => {
	if (value === null || value === undefined) return "unset";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
};

/** `credit_schema` and `billingControls` both read as "Billing controls". */
const humanizeKey = (key: string): string => {
	const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

/**
 * One line per changed attribute. A null previous value means the field was
 * unset, so it reads as added; a current value, when the row carries one,
 * completes the arrow.
 */
const renderPreviousAttributes = ({
	attributes,
	indent,
	current = {},
	skip = [],
}: {
	attributes: Record<string, unknown> | null | undefined;
	indent: string;
	current?: Record<string, unknown>;
	/** Keys a dedicated change line already covers. */
	skip?: string[];
}): string[] =>
	Object.entries(attributes ?? {})
		.filter(([key]) => !skip.includes(key))
		.map(([key, previous]) => {
			const label = humanizeKey(key);
			const added = previous === null || previous === undefined;
			const { symbol, paint } = marker(added ? "create" : "update");
			const now = current[key];
			const text =
				now !== undefined
					? added
						? formatValue(now)
						: `${formatValue(previous)} -> ${formatValue(now)}`
					: added
						? "added"
						: `was ${formatValue(previous)}`;
			return `${indent}${paint(`${symbol} ${label}: ${text}`)}`;
		});

const formatMoney = (amount: number): string =>
	`$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

const formatInterval = (interval?: string, count?: number): string => {
	if (interval === undefined || interval === "one_off") return "one-off";
	const unit = interval.replace(/_/g, " ");
	return count !== undefined && count > 1
		? `per ${count} ${unit}s`
		: `per ${unit}`;
};

const formatPrice = (price: PriceLite | undefined): string => {
	if (price === null || price === undefined) return "Free";
	if (price.tiers !== undefined && price.tiers.length > 0)
		return `${price.tiers.length} tiers ${formatInterval(price.interval, price.intervalCount)}`;
	return `${formatMoney(price.amount ?? 0)} ${formatInterval(price.interval, price.intervalCount)}`;
};

const formatItem = (item: ItemLite | undefined): string => {
	if (item === undefined) return "?";
	const display = [item.display?.primaryText, item.display?.secondaryText]
		.filter((text): text is string => typeof text === "string" && text !== "")
		.join(", ");
	if (display !== "") return display;
	const quantity = item.unlimited ? "unlimited" : String(item.included ?? 0);
	const price = item.price ? ` (${formatPrice(item.price)})` : "";
	return `${quantity} ${item.featureId ?? "?"}${price}`;
};

/**
 * The server lists a changed item as one deleted and one created entry on the
 * same feature; pairing them back up is the renderer's job.
 */
const pairItemChanges = (
	itemChanges: PlanItemChangeLite[],
): {
	changed: { from: PlanItemChangeLite; to: PlanItemChangeLite }[];
	added: PlanItemChangeLite[];
	removed: PlanItemChangeLite[];
} => {
	const deleted = itemChanges.filter((change) => change.action === "deleted");
	const created = itemChanges.filter((change) => change.action === "created");
	const changed: { from: PlanItemChangeLite; to: PlanItemChangeLite }[] = [];
	const added: PlanItemChangeLite[] = [];
	for (const change of created) {
		const index = deleted.findIndex(
			(candidate) => candidate.featureId === change.featureId,
		);
		if (index === -1) {
			added.push(change);
			continue;
		}
		const [from] = deleted.splice(index, 1);
		changed.push({ from, to: change });
	}
	return { changed, added, removed: deleted };
};

const renderItemChanges = ({
	itemChanges,
	indent,
}: {
	itemChanges: PlanItemChangeLite[];
	indent: string;
}): string[] => {
	const { changed, added, removed } = pairItemChanges(itemChanges);
	const render = (action: string, id: string, text: string): string => {
		const { symbol, paint } = marker(action);
		return `${indent}${paint(`${symbol} ${id}`)}  ${text}`;
	};
	return [
		...added.map((change) =>
			render("create", change.featureId ?? "?", formatItem(change.item)),
		),
		...removed.map((change) =>
			render("delete", change.featureId ?? "?", formatItem(change.item)),
		),
		...changed.map(({ from, to }) =>
			render(
				"update",
				to.featureId ?? "?",
				`${formatItem(from.item)} -> ${formatItem(to.item)}`,
			),
		),
	];
};

const renderPriceChange = ({
	priceChange,
	indent,
}: {
	priceChange: PlanChangeLite["priceChange"];
	indent: string;
}): string[] => {
	if (priceChange === undefined) return [];
	const { symbol, paint } = marker("update");
	return [
		`${indent}${paint(`${symbol} Price: ${formatPrice(priceChange.previous)} -> ${formatPrice(priceChange.current)}`)}`,
	];
};

const formatTrial = (trial: TrialLite | undefined): string =>
	trial === null || trial === undefined
		? "none"
		: `${trial.durationLength ?? "?"} ${trial.durationType ?? "day"} trial`;

const renderFreeTrialChange = ({
	freeTrialChange,
	indent,
}: {
	freeTrialChange: PlanChangeLite["freeTrialChange"];
	indent: string;
}): string[] => {
	if (freeTrialChange === undefined) return [];
	const { symbol, paint } = marker("update");
	return [
		`${indent}${paint(`${symbol} Free trial: ${formatTrial(freeTrialChange.previous)} -> ${formatTrial(freeTrialChange.current)}`)}`,
	];
};

const renderLicenseChanges = ({
	licenseChanges,
	indent,
}: {
	licenseChanges: PlanLicenseChangeLite[];
	indent: string;
}): string[] =>
	licenseChanges.flatMap((change) => {
		const id =
			change.version === undefined
				? (change.licensePlanId ?? "?")
				: `${change.licensePlanId}@v${change.version}`;
		return [
			`${line({ action: change.action, id, indent })}${chalk.dim("  (license)")}`,
			...renderPreviousAttributes({
				attributes: change.previousAttributes,
				indent: `${indent}  `,
				current: {
					included: change.included,
					prepaidOnly: change.prepaidOnly,
					version: change.version,
				},
			}),
			...(change.planChange
				? renderPlanChangeDetail({
						planChange: change.planChange,
						indent: `${indent}  `,
					})
				: []),
		];
	});

/** Every field-level line the server's plan diff carries, nested under a row. */
const renderPlanChangeDetail = ({
	planChange,
	current = {},
	indent,
}: {
	planChange: PlanChangeLite;
	current?: Record<string, unknown>;
	indent: string;
}): string[] => [
	...renderPreviousAttributes({
		attributes: planChange.previousAttributes,
		skip: planChange.freeTrialChange === undefined ? [] : ["freeTrial"],
		indent,
		current,
	}),
	...renderPriceChange({ priceChange: planChange.priceChange, indent }),
	...renderFreeTrialChange({
		freeTrialChange: planChange.freeTrialChange,
		indent,
	}),
	...renderItemChanges({ itemChanges: planChange.itemChanges ?? [], indent }),
	...renderLicenseChanges({
		licenseChanges: planChange.licenseChanges ?? [],
		indent,
	}),
];

/**
 * Positive on purpose: listing what counts as a change means a no-op value
 * added to the enum later reads as "nothing to do" rather than leaking into
 * the output as an unknown marker.
 */
const isChange = (change: PreviewChange): boolean =>
	change.action !== undefined && APPLIED_ACTIONS.has(change.action);

const DETAIL_INDENT = "    ";

export const renderPreview = ({
	preview,
	migrationLinkBase,
}: {
	preview: CatalogPreview;
	/** Omitted in tests; the dashboard origin in real runs. */
	migrationLinkBase?: string;
}): string => {
	const features = (preview.features ?? []).filter(isChange);
	const plans = (preview.plans ?? []).filter(isChange);
	const migrations = preview.migrations ?? [];

	if (features.length === 0 && plans.length === 0) {
		return chalk.dim("No changes. Your catalog matches your config.");
	}

	const sections: string[] = [];

	if (features.length > 0) {
		sections.push(
			[
				chalk.bold(`Features (${features.length})`),
				...features.flatMap((feature) => [
					line({
						action: feature.action,
						id: feature.featureId ?? "?",
						label: feature.name,
					}),
					...renderPreviousAttributes({
						attributes: feature.previousAttributes,
						indent: DETAIL_INDENT,
					}),
				]),
			].join("\n"),
		);
	}

	if (plans.length > 0) {
		sections.push(
			[
				chalk.bold(`Plans (${plans.length})`),
				...plans.flatMap((plan) => [
					line({
						action: plan.action,
						id:
							plan.version === undefined
								? (plan.planId ?? "?")
								: `${plan.planId}@v${plan.version}`,
						label: plan.name,
					}),
					...(plan.planChange
						? renderPlanChangeDetail({
								planChange: plan.planChange,
								current: plan.name === undefined ? {} : { name: plan.name },
								indent: DETAIL_INDENT,
							})
						: []),
				]),
			].join("\n"),
		);
	}

	if (migrations.length > 0) {
		// Draft migrations are the server telling you customers need moving. The
		// push still applies; these are run later, deliberately.
		sections.push(
			[
				chalk.bold(`Draft migrations (${migrations.length})`),
				...migrations.map((migration) =>
					migrationLinkBase
						? `  ${chalk.cyan(`${migrationLinkBase}/migrations/${migration.id}`)}`
						: `  ${chalk.cyan(migration.id ?? "?")}`,
				),
			].join("\n"),
		);
	}

	return sections.join("\n\n");
};

/** A row is work when its own action is, or when anything nested under it
 * (a variant, a license link, a sibling version) carries a changing action. */
const rowHasWork = (row: PreviewChange): boolean => {
	if (isChange(row)) return true;
	return Object.values(row as Record<string, unknown>).some(
		(value) =>
			Array.isArray(value) &&
			value.some(
				(entry) =>
					entry !== null &&
					typeof entry === "object" &&
					Object.entries(entry as Record<string, unknown>).some(
						([key, nested]) =>
							key.endsWith("ction") &&
							typeof nested === "string" &&
							APPLIED_ACTIONS.has(nested),
					),
			),
	);
};

/** True when there is nothing to apply — lets push skip the write entirely. */
export const previewIsEmpty = ({
	preview,
}: {
	preview: CatalogPreview;
}): boolean =>
	!(preview.features ?? []).some(rowHasWork) &&
	!(preview.plans ?? []).some(rowHasWork);
