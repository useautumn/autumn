import { expect, test } from "bun:test";
import { isModernScope, LEGACY_SCOPE_ALIASES, Scopes } from "@autumn/shared";
import { buildCliOAuthScopes } from "../../src/commands/auth/oauth.js";

const resolve = (scope: string) => LEGACY_SCOPE_ALIASES[scope] ?? scope;
const granted = new Set(buildCliOAuthScopes().map(resolve));

test("login grants rewards:read, which pull needs to list rewards", () => {
	expect(granted).toContain(Scopes.Rewards.Read);
});

test("login grants read access for every resource pull fetches", () => {
	for (const scope of [
		Scopes.Features.Read,
		Scopes.Plans.Read,
		Scopes.Rewards.Read,
	]) {
		expect(granted).toContain(scope);
	}
});

test("every requested scope resolves to a known modern scope", () => {
	for (const scope of granted) {
		expect(isModernScope(scope)).toBe(true);
	}
});
