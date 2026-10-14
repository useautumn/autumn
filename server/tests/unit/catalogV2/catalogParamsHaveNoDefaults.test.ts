import { expect, test } from "bun:test";
import { UpdateCatalogParamsSchema } from "@autumn/shared";
import chalk from "chalk";

const ALLOWED_DEFAULTS: Record<string, string> = {
	skip_deletions: "absent means patch mode; there is no third state",
	skip_version_deletions:
		"absent means unstated versions are left alone; there is no third state",
	skip_plan_ids: "an exemption list nobody sweeps",
	skip_feature_ids: "an exemption list nobody sweeps",
	remove_plans: "imperative removals; absent and empty both mean 'none'",
	remove_features: "imperative removals; absent and empty both mean 'none'",

	"plans.migration.draft": "gated by `migration`",
	"plans.free_trial.card_required": "gated by `free_trial`",
	"plans.free_trial.duration_type": "gated by `free_trial`",
	"plans.items.pooled": "gated by `items`",
	"plans.items.price.billing_units": "gated by `items[].price`",
	"plans.items.price.interval_count": "gated by `items[].price`",
	"plans.billing_controls.auto_topups.enabled": "gated by `billing_controls`",
	"plans.billing_controls.auto_topups.purchase_limit.interval_count":
		"gated by `billing_controls`",
	"plans.billing_controls.spend_limits.enabled": "gated by `billing_controls`",
	"plans.billing_controls.usage_limits.enabled": "gated by `billing_controls`",
	"plans.billing_controls.usage_alerts.enabled": "gated by `billing_controls`",
	"plans.billing_controls.usage_alerts.basis": "gated by `billing_controls`",
	"plans.billing_controls.overage_allowed.enabled":
		"gated by `billing_controls`",
};

type SchemaNode = {
	_zod?: { def?: Record<string, unknown> };
	def?: Record<string, unknown>;
};

const definitionOf = (node: unknown): Record<string, unknown> | undefined => {
	const candidate = node as SchemaNode | null;
	return candidate?._zod?.def ?? candidate?.def;
};

const defaultedPaths = ({
	schema,
	path = "",
	seen = new Set<unknown>(),
}: {
	schema: unknown;
	path?: string;
	seen?: Set<unknown>;
}): string[] => {
	if (schema === null || typeof schema !== "object") return [];
	if (seen.has(schema)) return [];
	seen.add(schema);

	const def = definitionOf(schema);
	if (!def) return [];

	const found: string[] = [];
	if (def.type === "default" || def.type === "prefault") {
		if (path) found.push(path);
	}

	for (const key of ["innerType", "element", "in", "out"]) {
		const child = def[key];
		if (child) found.push(...defaultedPaths({ schema: child, path, seen }));
	}

	const shape = def.shape as Record<string, unknown> | undefined;
	if (shape) {
		for (const [field, child] of Object.entries(shape)) {
			found.push(
				...defaultedPaths({
					schema: child,
					path: path ? `${path}.${field}` : field,
					seen,
				}),
			);
		}
	}

	for (const key of ["options", "items"]) {
		const members = def[key];
		if (Array.isArray(members)) {
			for (const member of members) {
				found.push(...defaultedPaths({ schema: member, path, seen }));
			}
		}
	}

	return found;
};

test(`${chalk.yellowBright("catalogV2 params: no field carries a schema default")}`, () => {
	const offenders = [
		...new Set(defaultedPaths({ schema: UpdateCatalogParamsSchema })),
	].filter((path) => ALLOWED_DEFAULTS[path] === undefined);

	expect(
		offenders,
		`these fields have a schema default, which erases "omitted" vs "explicitly set". Remove the default, or add it to ALLOWED_DEFAULTS with a reason: ${offenders.join(", ")}`,
	).toEqual([]);
});

test(`${chalk.yellowBright("catalogV2 params: the walker actually finds defaults")}`, () => {
	const paths = defaultedPaths({ schema: UpdateCatalogParamsSchema });
	expect(paths, "walker found the known-allowed defaults").toContain(
		"skip_deletions",
	);
	expect(paths, "desired-state collections carry no default").not.toContain(
		"features",
	);
	expect(paths, "desired-state collections carry no default").not.toContain(
		"plans",
	);
});
