import chalk from "chalk";
import { PREVIOUS_ATTRIBUTE_LABELS } from "../generated/labels";

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
	/** The edit that produces this diff; a create's name lives here. */
	customize?: Record<string, unknown> | null;
};

// Fixture casing, not wire: the client recases every response on the way in,
// so this renders `featureId`, never `feature_id`. One exception: a feature's
// `previousAttributes` is a frozen record and keeps its snake_case keys.
type FeatureChange = PreviewChange & {
	featureId?: string;
	previousAttributes?: Record<string, unknown> | null;
};
/**
 * A variant plan under its base. It has no `action` of its own: `variantAction`
 * says how it resolved against the base edit, and `planChange` says whether
 * anything actually changes.
 */
type VariantChange = {
	planId?: string;
	/** Null until the row exists, so a null id is this update minting it. */
	internalId?: string | null;
	version?: number;
	active?: boolean;
	variantAction?: string;
	planChange?: PlanChangeLite | null;
	siblingVersions?: VariantChange[];
};

type PlanChange = PreviewChange & {
	planId?: string;
	version?: number;
	active?: boolean;
	planChange?: PlanChangeLite | null;
	siblingVersions?: PlanChange[];
	variants?: VariantChange[];
	state?: unknown;
};

export type CatalogPreview = {
	features?: FeatureChange[];
	plans?: PlanChange[];
	migrations?: PlannedMigration[];
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

/** Printed as the API names them, because prose would read as a different field. */
const LITERAL_LABEL_KEYS = new Set(["active"]);

/** `credit_schema` and `billingControls` both read as "Billing controls". */
/** The shared label when there is one; the key's own words otherwise. */
const labelFor = (key: string): string => {
	if (LITERAL_LABEL_KEYS.has(key)) return key;
	const wireKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
	return PREVIOUS_ATTRIBUTE_LABELS[wireKey] ?? humanizeKey(key);
};

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
			const label = labelFor(key);
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

/** Lines a caller already put on the row itself, so the detail block does not
 * print them twice. */
type CoveredDetail = "name" | "price" | "items";

/** Every field-level line the server's plan diff carries, nested under a row. */
const renderPlanChangeDetail = ({
	planChange,
	current = {},
	indent,
	covered = [],
}: {
	planChange: PlanChangeLite;
	current?: Record<string, unknown>;
	indent: string;
	covered?: readonly CoveredDetail[];
}): string[] => [
	...renderPreviousAttributes({
		attributes: planChange.previousAttributes,
		skip: [
			...(planChange.freeTrialChange === undefined ? [] : ["freeTrial"]),
			...(covered.includes("name") ? ["name"] : []),
		],
		indent,
		current,
	}),
	...(covered.includes("price")
		? []
		: renderPriceChange({ priceChange: planChange.priceChange, indent })),
	...renderFreeTrialChange({
		freeTrialChange: planChange.freeTrialChange,
		indent,
	}),
	...(covered.includes("items")
		? []
		: renderItemChanges({ itemChanges: planChange.itemChanges ?? [], indent })),
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

/** The no-op end of every action enum the preview uses. */
const NOOP_ACTIONS = new Set(["none", "skip", "unchanged"]);

/** `explicit` and `propagated` say how a variant resolved against the base
 * edit, not that anything changes — only its own diff decides that. */
const VARIANT_RESOLUTIONS = new Set(["explicit", "propagated"]);

const statesPlanChange = (row: Record<string, unknown>): boolean =>
	row.planChange !== null && row.planChange !== undefined;

/**
 * A nested row (a variant, a license link, a sibling version) is work when it
 * states a changing action, when a resolution word comes with a diff, or when
 * anything nested under it is work.
 */
const nestedRowHasWork = (entry: unknown): boolean => {
	if (entry === null || typeof entry !== "object") return false;
	const row = entry as Record<string, unknown>;
	for (const [key, value] of Object.entries(row)) {
		if (Array.isArray(value) && value.some(nestedRowHasWork)) return true;
		if (!key.toLowerCase().endsWith("action") || typeof value !== "string")
			continue;
		if (NOOP_ACTIONS.has(value)) continue;
		if (VARIANT_RESOLUTIONS.has(value)) {
			if (statesPlanChange(row)) return true;
			continue;
		}
		return true;
	}
	return false;
};

/** The one rule the gate and the renderer share: a row counts when its own
 * action is applied, or when anything nested under it has work. */
const rowHasWork = (row: PreviewChange): boolean =>
	isChange(row) ||
	Object.values(row as Record<string, unknown>).some(
		(value) => Array.isArray(value) && value.some(nestedRowHasWork),
	);

const DETAIL_INDENT = "    ";
const VARIANT_INDENT = DETAIL_INDENT;

const planRowId = (row: { planId?: string; version?: number }): string =>
	row.version === undefined
		? (row.planId ?? "?")
		: `${row.planId}@v${row.version}`;

/** A row printed only to place the work nested under it: no marker, no colour. */
const contextLine = ({
	id,
	label,
	indent = "  ",
}: {
	id: string;
	label?: string;
	indent?: string;
}): string => {
	const suffix = label && label !== id ? chalk.dim(`  ${label}`) : "";
	return `${indent}  ${chalk.dim(id)}${suffix}`;
};

/** A variant with no stable id yet is one this update mints. */
const isVariantCreate = (variant: VariantChange): boolean =>
	variant.internalId === null || variant.internalId === undefined;

/** A minted row has no `name` of its own, so the edit that mints it names it. */
const variantCreateLabel = (planChange: PlanChangeLite | undefined): string => {
	const name = planChange?.customize?.name;
	const price = formatPrice(planChange?.priceChange?.current);
	return typeof name === "string" ? `${name}, ${price}` : price;
};

/**
 * One variant under its base: a propagated row only names the change it takes,
 * a create carries its price on the row and its items below, and an edit reads
 * as any other plan diff.
 */
const renderVariantRow = ({
	variant,
	baseId,
	indent,
}: {
	variant: VariantChange;
	baseId: string;
	indent: string;
}): string[] => {
	const id = planRowId(variant);
	const detailIndent = `${indent}  `;
	const planChange = variant.planChange ?? undefined;
	const nested = (variant.siblingVersions ?? [])
		.filter(nestedRowHasWork)
		.flatMap((sibling) =>
			renderVariantRow({ variant: sibling, baseId, indent: detailIndent }),
		);
	if (variant.variantAction === "propagated") {
		return [
			`${line({ action: "update", id, indent })}${chalk.dim(`  follows ${baseId}`)}`,
			...nested,
		];
	}
	if (isVariantCreate(variant)) {
		return [
			line({
				action: "create",
				id,
				label: variantCreateLabel(planChange),
				indent,
			}),
			...renderItemChanges({
				itemChanges: planChange?.itemChanges ?? [],
				indent: detailIndent,
			}),
			// The row's label carries the name and the price, and the items are
			// already out; everything else the server sent still belongs here.
			...(planChange
				? renderPlanChangeDetail({
						planChange,
						indent: detailIndent,
						covered: ["name", "price", "items"],
					})
				: []),
			...nested,
		];
	}
	return [
		line({ action: "update", id, indent }),
		...(planChange
			? renderPlanChangeDetail({
					planChange,
					current: currentAttributes(variant),
					indent: detailIndent,
				})
			: []),
		...nested,
	];
};

/** Variants hang off the edited row and off every sibling version an
 * `all_versions` edit fans out to; each lane names its own base. */
const renderVariantLanes = ({ plan }: { plan: PlanChange }): string[] =>
	[
		{ baseId: planRowId(plan), variants: plan.variants ?? [] },
		...(plan.siblingVersions ?? []).map((sibling) => ({
			baseId: planRowId(sibling),
			variants: sibling.variants ?? [],
		})),
	].flatMap(({ baseId, variants }) =>
		variants
			.filter(nestedRowHasWork)
			.flatMap((variant) =>
				renderVariantRow({ variant, baseId, indent: VARIANT_INDENT }),
			),
	);

/** The row's own scalars, so a previous value can complete its arrow. */
const currentAttributes = (plan: {
	name?: string;
	active?: boolean;
}): Record<string, unknown> => ({
	...(plan.name === undefined ? {} : { name: plan.name }),
	...(plan.active === undefined ? {} : { active: plan.active }),
});

/** The plan's own line — a marker when it changes, context when its variants
 * are the only work — then its diff, then those variants. */
const renderPlanRow = ({ plan }: { plan: PlanChange }): string[] => {
	const id = planRowId(plan);
	return [
		isChange(plan)
			? line({ action: plan.action, id, label: plan.name })
			: contextLine({ id, label: plan.name }),
		...(plan.planChange
			? renderPlanChangeDetail({
					planChange: plan.planChange,
					current: currentAttributes(plan),
					indent: DETAIL_INDENT,
				})
			: []),
		...renderVariantLanes({ plan }),
	];
};

/** A migration the preview says a push would draft: no id yet, only its targets. */
export type PlannedMigration = {
	id?: string;
	plans?: { planId: string; versions?: number[] }[];
	includeCustom?: boolean;
};

/**
 * The plan row a migration target names: the top-level row for that version,
 * else the sibling version one of them lists. Undefined when nothing matches —
 * another version's customer count and diff would describe the wrong move.
 */
const planRowForTarget = ({
	plans,
	planId,
	version,
}: {
	plans: PlanChange[];
	planId: string;
	version: number;
}): PlanChange | undefined => {
	const rows = plans.filter((plan) => plan.planId === planId);
	const direct = rows.find((row) => row.version === version);
	if (direct !== undefined) return direct;
	for (const row of rows) {
		const sibling = (row.siblingVersions ?? []).find(
			(candidate) => candidate.version === version,
		);
		if (sibling !== undefined) return { ...row, ...sibling };
	}
	return undefined;
};

const customerCount = ({ row }: { row: PlanChange | undefined }): string => {
	const customers = (
		row?.state as
			| { usage?: { customers?: { count?: number; countCapped?: boolean } } }
			| undefined
	)?.usage?.customers;
	if (customers?.count === undefined) return "";
	const count = `${customers.count}${customers.countCapped ? "+" : ""}`;
	return `, ${count} customer${customers.count === 1 && !customers.countCapped ? "" : "s"}`;
};

/**
 * What each migration is: the plan version whose customers it moves, how many
 * of them, and the changes those customers receive — the target row's own diff.
 */
export const renderPlannedMigrations = ({
	migrations,
	plans,
}: {
	migrations: PlannedMigration[];
	plans: PlanChange[];
}): string =>
	[
		chalk.bold(`Migrations (${migrations.length})`),
		...migrations.flatMap((migration) =>
			(migration.plans ?? []).flatMap((target) =>
				(target.versions ?? []).flatMap((version) => {
					const row = planRowForTarget({
						plans,
						planId: target.planId,
						version,
					});
					const custom = migration.includeCustom
						? ", customized plans too"
						: "";
					return [
						`  ${chalk.cyan(`${target.planId} v${version}`)}${customerCount({ row })}${custom}`,
						...(row?.planChange
							? renderPlanChangeDetail({
									planChange: row.planChange,
									indent: DETAIL_INDENT,
								})
							: []),
					];
				}),
			),
		),
	].join("\n");

/** The drafted migrations, one link per line. */
export const renderMigrationLinks = ({
	migrations,
	migrationLinkBase,
}: {
	migrations: { id?: string }[];
	migrationLinkBase?: string;
}): string =>
	[
		chalk.bold(`Draft migrations (${migrations.length})`),
		...migrations.map((migration) =>
			migrationLinkBase && migration.id
				? `  ${chalk.cyan(`${migrationLinkBase}/migrations/${migration.id}`)}`
				: `  ${chalk.cyan(migration.id ?? "?")}`,
		),
	].join("\n");

export const renderPreview = ({
	preview,
	migrationLinkBase,
}: {
	preview: CatalogPreview;
	/** Omitted in tests; the dashboard origin in real runs. */
	migrationLinkBase?: string;
}): string => {
	const features = (preview.features ?? []).filter(rowHasWork);
	const plans = (preview.plans ?? []).filter(rowHasWork);
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
				...plans.flatMap((plan) => renderPlanRow({ plan })),
			].join("\n"),
		);
	}

	if (migrations.length > 0) {
		// The server saying customers would need moving. Nothing is drafted by a
		// preview; the applied block after --yes carries the ids and links.
		sections.push(renderPlannedMigrations({ migrations, plans }));
	}

	return sections.join("\n\n");
};

/** True when there is nothing to apply — lets push skip the write entirely. */
export const previewIsEmpty = ({
	preview,
}: {
	preview: CatalogPreview;
}): boolean =>
	!(preview.features ?? []).some(rowHasWork) &&
	!(preview.plans ?? []).some(rowHasWork);
