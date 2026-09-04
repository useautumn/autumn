/**
 * A catalog request field must not carry a schema default.
 *
 * A default is applied before any `!== undefined` gate can run, so it erases
 * the difference between "the caller omitted this" and "the caller set this
 * explicitly". Everywhere in the upsert path that difference IS the semantics:
 * `planParamsToProductRowPatch` only writes fields that are defined, and
 * `computeCatalogEntitlementPricesPlan` produces no writes at all when `items`
 * is absent. Under `skip_deletions: false` it is the difference between "I
 * have no opinion about features" and "delete every feature".
 *
 * That was a live bug: `features` and `plans` carried `.optional().default([])`,
 * so a client that had never heard of a collection was indistinguishable from
 * one demanding it be emptied.
 *
 * Anything on ALLOWED_DEFAULTS is a field whose default IS its meaning and
 * which nothing needs to detect the absence of. Adding to it should be a
 * deliberate act with a reason, which is the point of the list being here.
 */

import { expect, test } from "bun:test";
import { UpdateCatalogParamsSchema } from "@autumn/shared";
import chalk from "chalk";

/**
 * field path → why a default is safe here.
 *
 * Two shapes qualify. Top-level fields whose default IS their meaning, with no
 * third state to detect. And fields nested inside an object that is itself
 * presence-gated — you only reach `auto_topups.enabled` by stating
 * `auto_topups`, and stating the parent is the command. A top-level collection
 * has no such parent, which is exactly why `features` and `plans` were wrong.
 *
 * The gated ones still carry a smaller version of the same risk: add a field
 * under `auto_topups` with a default and a client that states `auto_topups`
 * without it loses that field. Worth knowing before adding one.
 */
const ALLOWED_DEFAULTS: Record<string, string> = {
	skip_deletions: "absent means patch mode; there is no third state",
	skip_version_deletions:
		"absent means unstated versions are left alone; there is no third state",
	skip_plan_ids: "an exemption list nobody sweeps",
	skip_feature_ids: "an exemption list nobody sweeps",
	remove_plans: "imperative removals; absent and empty both mean 'none'",
	remove_features: "imperative removals; absent and empty both mean 'none'",

	// Gated by their parent's presence.
	"plans.migration.draft": "gated by `migration`",
	"plans.config.ignore_past_due": "gated by `config`",
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

/** Field paths under `schema` whose definition chain includes a default. */
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

	// Unwrap optional/nullable/default/array/etc. by walking known child slots.
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
	// Without this the test above passes just as happily on a broken walker.
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
