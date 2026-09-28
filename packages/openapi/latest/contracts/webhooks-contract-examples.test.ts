/**
 * Every webhooks.* example the docs and SDKs publish must satisfy the schema
 * it illustrates: an example missing a required field teaches the wrong shape.
 */

import { expect, test } from "bun:test";
import type { ZodType } from "zod/v4";
import * as webhooks from "./webhooksContract";

type Contract = { "~orpc": { inputSchema?: ZodType; outputSchema?: ZodType } };

const schemasOf = (contract: Contract) =>
	[contract["~orpc"].inputSchema, contract["~orpc"].outputSchema].filter(
		(schema): schema is ZodType => schema !== undefined,
	);

const cases = Object.entries(webhooks)
	.filter(([name]) => name.endsWith("Contract"))
	.flatMap(([name, contract]) =>
		schemasOf(contract as Contract).flatMap((schema) =>
			((schema.meta()?.examples as unknown[] | undefined) ?? []).map(
				(example) => ({ name, schema, example }),
			),
		),
	);

test("the webhooks contract publishes examples", () => {
	expect(cases.length).toBeGreaterThan(0);
});

test.each(cases)("$name example matches its schema", ({ schema, example }) => {
	const result = schema.safeParse(example);
	expect(result.success ? [] : result.error.issues).toEqual([]);
});
