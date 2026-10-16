/**
 * S4a contract (audit §4.3): the evaluator knows every field S3's filter shapes
 * accept, so schema and evaluator can't drift apart unnoticed.
 *
 * Red (before):  no registry under the S3 filter keys; entity and the anchor were missing.
 * Green (after): every shape's keys equal the registry's keys, nested objects included.
 */

import { describe, expect, test } from "bun:test";
import { APPROVAL_FILTER_SHAPES, type ApprovalFilterKey } from "@autumn/shared";
import {
	FILTER_FIELDS_BY_KEY,
	type FilterFields,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import { z } from "zod/v4";

const NESTED_KEYS = [
	"incoming",
	"next_cycle",
	"entity",
	"free_trial",
	"discounts",
];

// `custom` describes an existing customer plan; incoming plans use `customized`,
// so the evaluator treats `custom` there as unsupported on purpose.
const NOT_EVALUATED: Record<string, string[]> = {
	"billing_change.incoming": ["custom"],
};

/** The field schemas an object-like schema accepts, through optional, lazy, union and intersection. */
const fieldSchemasOf = (
	schema: z.core.$ZodType,
): Record<string, z.core.$ZodType> => {
	if (schema instanceof z.ZodOptional) return fieldSchemasOf(schema.unwrap());
	if (schema instanceof z.ZodLazy) return fieldSchemasOf(schema.unwrap());
	if (schema instanceof z.ZodUnion)
		return Object.assign({}, ...schema.options.map(fieldSchemasOf));
	if (schema instanceof z.ZodIntersection)
		return {
			...fieldSchemasOf(schema.def.left),
			...fieldSchemasOf(schema.def.right),
		};
	if (schema instanceof z.ZodObject)
		return Object.fromEntries(
			Object.entries(schema.shape).filter(([key]) => !key.startsWith("$")),
		);
	return {};
};

const expectRegistryMatchesShape = ({
	path,
	shape,
	fields,
}: {
	path: string;
	shape: Record<string, z.core.$ZodType>;
	fields: FilterFields<never>;
}) => {
	const notEvaluated = NOT_EVALUATED[path] ?? [];
	const shapeKeys = Object.keys(shape)
		.filter((key) => !notEvaluated.includes(key))
		.sort();
	expect({ path, keys: Object.keys(fields).sort() }).toEqual({
		path,
		keys: shapeKeys,
	});

	for (const key of NESTED_KEYS.filter((nested) => nested in shape)) {
		const nestedFields = fields[key]?.fields;
		expect({
			path: `${path}.${key}`,
			nested: nestedFields !== undefined,
		}).toEqual({
			path: `${path}.${key}`,
			nested: true,
		});
		expectRegistryMatchesShape({
			path: `${path}.${key}`,
			shape: fieldSchemasOf(shape[key]),
			fields: nestedFields ?? {},
		});
	}
};

describe("filter registry completeness", () => {
	const filterKeys = Object.keys(APPROVAL_FILTER_SHAPES) as ApprovalFilterKey[];

	test("there is a registry for every filter key", () => {
		expect(Object.keys(FILTER_FIELDS_BY_KEY).sort()).toEqual(
			[...filterKeys].sort(),
		);
	});

	for (const filterKey of filterKeys) {
		test(`${filterKey}: the registry covers the shape`, () => {
			expectRegistryMatchesShape({
				path: filterKey,
				shape: APPROVAL_FILTER_SHAPES[filterKey],
				fields: FILTER_FIELDS_BY_KEY[filterKey],
			});
		});
	}
});
