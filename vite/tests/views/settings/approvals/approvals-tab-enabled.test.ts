/** Contract: in a production build the Approvals tab shows for members who can read the organisation, as the rule list route requires. */

import { describe, expect, mock, test } from "bun:test";
import { Scopes } from "@autumn/shared";

let scopes: string[] = [];

mock.module("@/hooks/common/useAutumnFlags", () => ({
	useAutumnFlags: () => ({ isLoading: false }),
}));
mock.module("@/hooks/useScopes", () => ({
	useScopes: () => ({ has: (scope: string) => scopes.includes(scope) }),
}));

const { useIsSettingsTabEnabled } = await import(
	"@/views/settings/SettingsView"
);

describe("approvals settings tab", () => {
	test.each<[string, string[], boolean]>([
		["with organisation:read", [Scopes.Organisation.Read], true],
		["without it", [Scopes.Billing.Read], false],
	])("%s", (_label, granted, enabled) => {
		scopes = granted;
		expect(import.meta.env.DEV).toBeFalsy();
		expect(useIsSettingsTabEnabled()("approvals")).toBe(enabled);
	});
});
