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

// Fixture casing, not wire: the client recases every response on the way in,
// so this renders `featureId`, never `feature_id`.
type FeatureChange = PreviewChange & { featureId?: string };
type PlanChange = PreviewChange & { planId?: string; version?: number };

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

const marker = (action: ChangeAction | undefined) =>
	MARKERS[action ?? ""] ?? { symbol: "?", paint: chalk.dim };

const line = ({
	action,
	id,
	label,
}: {
	action: ChangeAction | undefined;
	id: string;
	label?: string;
}): string => {
	const { symbol, paint } = marker(action);
	const suffix = label && label !== id ? chalk.dim(`  ${label}`) : "";
	return `  ${paint(`${symbol} ${id}`)}${suffix}`;
};

/**
 * Positive on purpose: listing what counts as a change means a no-op value
 * added to the enum later reads as "nothing to do" rather than leaking into
 * the output as an unknown marker.
 */
const isChange = (change: PreviewChange): boolean =>
	change.action !== undefined && APPLIED_ACTIONS.has(change.action);

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
				...features.map((feature) =>
					line({
						action: feature.action,
						id: feature.featureId ?? "?",
						label: feature.name,
					}),
				),
			].join("\n"),
		);
	}

	if (plans.length > 0) {
		sections.push(
			[
				chalk.bold(`Plans (${plans.length})`),
				...plans.map((plan) =>
					line({
						action: plan.action,
						id:
							plan.version === undefined
								? (plan.planId ?? "?")
								: `${plan.planId}@v${plan.version}`,
						label: plan.name,
					}),
				),
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

/** True when there is nothing to apply — lets push skip the write entirely. */
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

export const previewIsEmpty = ({
	preview,
}: {
	preview: CatalogPreview;
}): boolean =>
	!(preview.features ?? []).some(rowHasWork) &&
	!(preview.plans ?? []).some(rowHasWork);
