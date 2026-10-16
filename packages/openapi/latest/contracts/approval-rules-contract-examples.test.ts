/**
 * Every approval_rules.* and roles.list example the docs and SDKs publish must satisfy the
 * schema it illustrates (Stage 3, D2b): an example missing a required field teaches the wrong shape.
 */

import { expect, test } from "bun:test";
import type { ZodType } from "zod/v4";
import * as approvalRules from "./approvalRulesContract";
import * as roles from "./rolesContract";

type Contract = { "~orpc": { inputSchema?: ZodType; outputSchema?: ZodType } };

const schemasOf = (contract: Contract) =>
	[contract["~orpc"].inputSchema, contract["~orpc"].outputSchema].filter(
		(schema): schema is ZodType => schema !== undefined,
	);

const cases = Object.entries({ ...approvalRules, ...roles })
	.filter(([name]) => name.endsWith("Contract"))
	.flatMap(([name, contract]) =>
		schemasOf(contract as Contract).flatMap((schema) =>
			((schema.meta()?.examples as unknown[] | undefined) ?? []).map(
				(example) => ({ name, schema, example }),
			),
		),
	);

test("the approval rules and roles contracts publish examples for all eight routes", () => {
	expect(new Set(cases.map(({ name }) => name)).size).toBe(8);
});

test.each(cases)("$name example matches its schema", ({ schema, example }) => {
	const result = schema.safeParse(example);
	expect(result.success ? [] : result.error.issues).toEqual([]);
});
