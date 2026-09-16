import { describe, expect, it } from "bun:test";
import {
	describeReplayOperatorError,
	type ReplayOperatorErrorReport,
} from "@/internal/balances/replay/operator/replayOperatorErrors.js";
import { parseReplayOperatorArgs } from "../../../../../scripts/balance-replay/parseReplayOperatorArgs.js";

const FIXTURE_PASSWORD = "fixture-Pa55word-not-real";
const FIXTURE_HOST = "db.fixture.invalid";
const FIXTURE_URL = `postgres://fixture_user:${FIXTURE_PASSWORD}@${FIXTURE_HOST}:5432/fixture_replay`;
const FIXTURE_PASSWORD_FLAG = `--password=${FIXTURE_PASSWORD}`;

const BASE_ARGS: readonly string[] = [
	"--manifest",
	"fixture/manifest.json",
	"--target-policy",
	"fixture/policy.json",
];

function rejectionReport({
	args,
}: {
	args: readonly string[];
}): ReplayOperatorErrorReport {
	try {
		parseReplayOperatorArgs({ args });
	} catch (error) {
		return describeReplayOperatorError({ error });
	}
	throw new Error("expected parseReplayOperatorArgs to reject these arguments");
}

function serializedRejection({ args }: { args: readonly string[] }): string {
	return JSON.stringify(rejectionReport({ args }));
}

describe("replay operator argument error reports", () => {
	it("never echoes a positional database URL", () => {
		const serialized = serializedRejection({
			args: [...BASE_ARGS, FIXTURE_URL],
		});
		expect(serialized).not.toContain(FIXTURE_URL);
		expect(serialized).not.toContain(FIXTURE_PASSWORD);
		expect(serialized).not.toContain(FIXTURE_HOST);
		expect(serialized).toContain("unexpected positional argument");
	});

	it("never echoes an unknown credential-bearing flag", () => {
		const serialized = serializedRejection({
			args: [...BASE_ARGS, FIXTURE_PASSWORD_FLAG],
		});
		expect(serialized).not.toContain(FIXTURE_PASSWORD_FLAG);
		expect(serialized).not.toContain(FIXTURE_PASSWORD);
		expect(serialized).not.toContain("password");
		expect(serialized).toContain("unknown flag");
	});

	it("still reports the argument error by name with a reason", () => {
		const report = rejectionReport({
			args: [...BASE_ARGS, FIXTURE_PASSWORD_FLAG],
		});
		expect(report.name).toBe("ReplayOperatorArgumentError");
		expect(report.reason).toBe(
			"invalid replay operator arguments: unknown flag",
		);
	});

	it("keeps parsing valid arguments unchanged", () => {
		expect(parseReplayOperatorArgs({ args: BASE_ARGS })).toEqual({
			help: false,
			manifestPath: "fixture/manifest.json",
			policyPath: "fixture/policy.json",
			execute: false,
			confirmFrozenBaseline: false,
			maxRequests: 1000,
			requestsPerSecond: 10,
		});
	});
});
