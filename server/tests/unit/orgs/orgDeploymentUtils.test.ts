import { describe, expect, test } from "bun:test";
import { isDeploymentApiKeyMeta } from "@/internal/orgs/orgDeploymentUtils";

describe("isDeploymentApiKeyMeta", () => {
	test("allows dashboard-created live keys", () => {
		expect(isDeploymentApiKeyMeta({ author: "Charlie" })).toBe(true);
		expect(isDeploymentApiKeyMeta({ created_via: "autumn_support" })).toBe(
			true,
		);
	});

	test("ignores auto-generated CLI and OAuth keys", () => {
		expect(isDeploymentApiKeyMeta({ fromCli: true })).toBe(false);
		expect(isDeploymentApiKeyMeta({ fromCli: "true" })).toBe(false);
		expect(isDeploymentApiKeyMeta({ created_via: "oauth" })).toBe(false);
	});
});
