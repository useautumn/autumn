import { afterAll, expect, spyOn, test } from "bun:test";
import type { Axiom } from "@axiomhq/js";
import * as initAxiomModule from "@/external/axiom/initAxiom.js";
import * as queryAxiomModule from "@/external/axiom/queryAxiom.js";
import {
	ATOM_LINE_EXTEND,
	queryAtomLogs,
} from "@/internal/byoc/actions/telemetry/atomLogs/queryAtomLogs.js";

const apls: string[] = [];
const client = spyOn(initAxiomModule, "getAtomAxiomClient").mockReturnValue(
	{} as Axiom,
);
const tabular = spyOn(queryAxiomModule, "queryAxiomTabular").mockImplementation(
	async ({ apl }) => {
		apls.push(apl);
		return [];
	},
);

afterAll(() => {
	client.mockRestore();
	tabular.mockRestore();
});

test("every Atom log query reads each line's JSON from alien's original record, falling back to the body", async () => {
	await queryAtomLogs({
		deploymentId: "dep_1",
		startTime: "now-1h",
		pipeline: "| where line contains 'x'",
	});

	expect(apls[0]).toBe(
		`['atom'] | where ['attributes.horizon.cluster_id'] == 'dep_1' ${ATOM_LINE_EXTEND} | where line contains 'x'`,
	);
	expect(ATOM_LINE_EXTEND).toContain("['attributes.log.record.original']");
	expect(ATOM_LINE_EXTEND).toContain("tostring(body)");
});
