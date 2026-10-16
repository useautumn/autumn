/**
 * The plan-item rate card editor works on the EFFECTIVE schema (the credit
 * system's rows merged with the override) and stores only what differs.
 *
 * Red (before):  the editor edits a full copy of the catalog schema, so every
 *                row is stored and omitted rows silently drop out.
 * Green (after): unchanged rows are inherited, edited and added rows are
 *                stored, and removed catalog rows are stored as excluded.
 */

import { expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import {
	effectiveSchemaToOverride,
	overrideToEffectiveSchema,
	restoreCatalogRate,
} from "./creditOverrideSchema";

const row = (metered_feature_id: string, credit_amount: number) =>
	({ metered_feature_id, credit_amount }) as CreditSchemaItem;

const creditSystem = {
	id: "credits",
	type: FeatureType.CreditSystem,
	config: {
		schema: [row("gateway", 3), row("image_gen", 1), row("search", 0.5)],
		usage_type: FeatureUsageType.Single,
	},
} as Feature;

test("an empty override shows the credit system's rows unchanged", () => {
	expect(overrideToEffectiveSchema({ override: [], creditSystem })).toEqual(
		creditSystem.config.schema,
	);
});

test("the effective schema applies rate rows and drops excluded rows", () => {
	const effective = overrideToEffectiveSchema({
		override: [
			row("gateway", 2.857),
			{ metered_feature_id: "image_gen", excluded: true },
		],
		creditSystem,
	});

	expect(effective).toEqual([row("gateway", 2.857), row("search", 0.5)]);
});

test("only edited, added and removed rows are stored", () => {
	const override = effectiveSchemaToOverride({
		schema: [row("gateway", 2.857), row("search", 0.5), row("video", 4)],
		catalog: creditSystem.config.schema,
	});

	expect(override).toEqual([
		row("gateway", 2.857),
		row("video", 4),
		{ metered_feature_id: "image_gen", excluded: true },
	]);
});

test("an unedited card stores nothing", () => {
	expect(
		effectiveSchemaToOverride({
			schema: creditSystem.config.schema,
			catalog: creditSystem.config.schema,
		}),
	).toEqual([]);
});

test("restoring a row above the open one moves the open row down, so rows are keyed by feature", () => {
	const catalog = creditSystem.config.schema;
	const before = overrideToEffectiveSchema({
		override: [{ metered_feature_id: "image_gen", excluded: true }],
		creditSystem,
	});
	const after = overrideToEffectiveSchema({
		override: effectiveSchemaToOverride({
			schema: restoreCatalogRate({ schema: before, catalogRate: catalog[1] }),
			catalog,
		}),
		creditSystem,
	});
	const position = (schema: CreditSchemaItem[]) =>
		schema.findIndex((item) => item.metered_feature_id === "search");

	expect(after).toEqual(catalog);
	expect([position(before), position(after)]).toEqual([1, 2]);
});
