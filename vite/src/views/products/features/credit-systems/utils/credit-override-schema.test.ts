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
	withRate,
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
		creditSystem,
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
			creditSystem,
		}),
	).toEqual([]);
});

test("withRate replaces a feature's rate in place and appends a new feature", () => {
	const schema = [row("gateway", 3), row("search", 0.5)];
	expect(withRate({ schema, rate: row("gateway", 2) })).toEqual([
		row("gateway", 2),
		row("search", 0.5),
	]);
	expect(withRate({ schema, rate: row("video", 4) })).toEqual([
		...schema,
		row("video", 4),
	]);
});
