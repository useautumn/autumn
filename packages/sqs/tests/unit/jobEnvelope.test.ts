import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { autoTopupJob } from "../../src/jobs/autoTopup.js";
import {
	parseJobEnvelope,
	serializeJobEnvelope,
} from "../../src/lib/job/jobEnvelope.js";

const payload = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	featureId: "credits",
};

describe("job envelope", () => {
	test("serializes to the body the server has always sent", () => {
		expect(
			JSON.parse(
				serializeJobEnvelope({ id: "job_1", name: "auto-top-up", payload }),
			),
		).toEqual({ id: "job_1", name: "auto-top-up", data: payload });
	});

	test("omits the id when there is none, as the server does", () => {
		expect(
			Object.keys(JSON.parse(serializeJobEnvelope({ name: "x", payload: {} }))),
		).toEqual(["name", "data"]);
	});

	test("parses a body back into the job it names, payload validated", () => {
		const body = serializeJobEnvelope({
			id: "job_1",
			name: "auto-top-up",
			payload,
		});
		expect(parseJobEnvelope({ body, jobs: [autoTopupJob] })).toEqual({
			id: "job_1",
			name: "auto-top-up",
			payload,
		});
	});

	test("refuses an unknown job, a bad payload, and a body that is not an envelope", () => {
		const unknown = serializeJobEnvelope({ name: "not-a-job", payload });
		expect(() =>
			parseJobEnvelope({ body: unknown, jobs: [autoTopupJob] }),
		).toThrow(/Unknown job/);
		const bad = serializeJobEnvelope({
			name: "auto-top-up",
			payload: { orgId: 1 },
		});
		expect(() => parseJobEnvelope({ body: bad, jobs: [autoTopupJob] })).toThrow(
			/Invalid payload/,
		);
		expect(() =>
			parseJobEnvelope({ body: "nope", jobs: [autoTopupJob] }),
		).toThrow(/Invalid job envelope/);
	});
});
