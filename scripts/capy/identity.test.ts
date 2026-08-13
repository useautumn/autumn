import { describe, expect, test } from "bun:test";
import { type CapyState, deriveBranchName, stateForMachine } from "./identity";

const state: CapyState = {
	machineId: "01KZXVM1111111111111111111",
	branchName: "capy-01kzxvm1111111111111111111",
	branchId: "branch-one",
	databaseUrl: "postgres://one",
	createdAt: 1,
	secrets: {
		betterAuthSecret: "auth-one",
		encryptionIv: "iv-one",
		encryptionPassword: "password-one",
	},
};

describe("Capy machine identity", () => {
	test("uses the complete binding ID in the Neon branch name", () => {
		expect(deriveBranchName("01KZXVM1111111111111111111")).toBe(
			"capy-01kzxvm1111111111111111111",
		);
		expect(deriveBranchName("01KZXVM2222222222222222222")).toBe(
			"capy-01kzxvm2222222222222222222",
		);
	});

	test("rejects state copied from another VM", () => {
		expect(stateForMachine(state, "01KZXVM2222222222222222222")).toBeNull();
	});

	test("reuses state only on the same VM", () => {
		expect(stateForMachine(state, "01KZXVM1111111111111111111")).toBe(state);
	});

	test("rejects malformed machine IDs", () => {
		expect(() => deriveBranchName("shared-snapshot-id")).toThrow(
			"bindingId is not a ULID",
		);
	});
});
