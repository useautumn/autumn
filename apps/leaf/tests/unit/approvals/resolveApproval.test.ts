import { describe, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const repoCalls: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			finalize: async () => {
				repoCalls.push("finalize");
			},
			release: async () => {
				repoCalls.push("release");
			},
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/resumeApproval.js",
	factory: () => ({
		resumeApproval: async () => {
			throw new Error("eve stream disconnected");
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: { error: () => {}, info: () => {}, warn: () => {} },
	}),
});

const { resolveApproval } = await import(
	"../../../src/internal/approvals/actions/resolveApproval.js"
);

const approval = () =>
	({
		env: AppEnv.Sandbox,
		harness: "eve",
		id: "a_1",
		org_id: "org_1",
		tool_name: "autumn__attach",
	}) as unknown as ChatApproval;

// Claiming moves the row pending→running. A retryable failure deliberately
// skips finalize so the user can retry — but without releasing the claim the
// row stays running forever and the card can never be clicked again.
describe("resolveApproval releases the claim it could not finalize", () => {
	test("returns the row to pending when the resume fails retryably", async () => {
		repoCalls.length = 0;

		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true, retryable: true });
		expect(repoCalls).toEqual(["release"]);
	});
});
