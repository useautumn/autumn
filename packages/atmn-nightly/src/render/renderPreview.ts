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

type FeatureChange = PreviewChange & { feature_id?: string };
type PlanChange = PreviewChange & { plan_id?: string; version?: number };

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
	skip: { symbol: "=", paint: chalk.dim },
};

const marker = (action: ChangeAction | undefined) =>
	MARKERS[action ?? "skip"] ?? { symbol: "?", paint: chalk.dim };

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

/** Anything that is not a no-op — what the user is actually being told. */
const isChange = (change: PreviewChange): boolean =>
	change.action !== undefined && change.action !== "skip";

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
						id: feature.feature_id ?? "?",
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
								? (plan.plan_id ?? "?")
								: `${plan.plan_id}@v${plan.version}`,
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
export const previewIsEmpty = ({
	preview,
}: {
	preview: CatalogPreview;
}): boolean =>
	(preview.features ?? []).filter(isChange).length === 0 &&
	(preview.plans ?? []).filter(isChange).length === 0;
