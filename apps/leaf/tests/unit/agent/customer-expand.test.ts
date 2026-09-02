import { expect, mock, test } from "bun:test";
import { GetCustomerParamsV1Schema } from "@autumn/shared";
import { z } from "zod/v4";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));

const { withCustomerExpand } = await import(
	"../../../agent/lib/autumnDirectTools.js"
);

/** The MCP tool validates `{ request }` strictly, so an expand added as a
 * sibling of `request` is rejected outright — that trapped the agent in a
 * retry loop, since it could not drop a field leaf kept re-adding. */
const toolInput = z.object({ request: GetCustomerParamsV1Schema }).strict();

test("the expanded call passes the tool's strict schema", () => {
	const expanded = withCustomerExpand({ request: { customer_id: "ccc333" } });
	expect(() => toolInput.parse(expanded)).not.toThrow();
	expect(expanded).toEqual({
		request: {
			customer_id: "ccc333",
			expand: ["payment_method", "subscriptions.plan"],
		},
	});
});

test("an expand the agent chose is left alone", () => {
	const input = { request: { customer_id: "c1", expand: ["invoices"] } };
	expect(withCustomerExpand(input)).toBe(input);
});

test("a payload with no request is untouched", () => {
	const input = { customer_id: "c1" };
	expect(withCustomerExpand(input)).toBe(input);
});
