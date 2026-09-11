import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const calls: string[] = [];
let stopError: { message: string } | null = null;
const stopImpersonating = mock(async () => {
	calls.push("stop");
	return { error: stopError };
});
const startImpersonating = mock(async (_params: { userId: string }) => {
	calls.push("impersonate");
	return { error: null };
});
const setActiveOrg = mock(async (_orgId: string) => {
	calls.push("set-org");
	return { error: null };
});
const getSession = mock(async () => {
	calls.push("get-session");
	return { data: { session: { activeOrganizationId: "org_123" } } };
});
const reload = mock(() => {
	calls.push("reload");
});
const toastError = mock((_message: string) => {});

const originalAuthModule = { ...(await import("@/lib/auth-client")) };
const originalOrgModule = { ...(await import("@/lib/orgSync")) };
const originalSonnerModule = { ...(await import("sonner")) };

mock.module("@/lib/auth-client", () => ({
	authClient: {
		admin: { stopImpersonating, impersonateUser: startImpersonating },
		getSession,
	},
}));
mock.module("@/lib/orgSync", () => ({ setActiveOrg }));
mock.module("sonner", () => ({ toast: { error: toastError } }));
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
	value: { location: { reload } },
	configurable: true,
});

afterAll(() => {
	mock.module("@/lib/auth-client", () => originalAuthModule);
	mock.module("@/lib/orgSync", () => originalOrgModule);
	mock.module("sonner", () => originalSonnerModule);
	if (originalWindow)
		Object.defineProperty(globalThis, "window", originalWindow);
	else Reflect.deleteProperty(globalThis, "window");
});

const { impersonateUser } = await import("../../../src/views/admin/adminUtils");

beforeEach(() => {
	calls.length = 0;
	stopError = null;
	stopImpersonating.mockClear();
	startImpersonating.mockClear();
	setActiveOrg.mockClear();
	getSession.mockClear();
	reload.mockClear();
	toastError.mockClear();
});

describe("admin impersonation", () => {
	test("restores admin before switching user and selected organization", async () => {
		await impersonateUser({
			userId: "user_123",
			organizationId: "org_123",
			isCurrentlyImpersonating: true,
		});
		expect(calls).toEqual([
			"stop",
			"impersonate",
			"set-org",
			"get-session",
			"reload",
		]);
		expect(startImpersonating).toHaveBeenCalledWith({ userId: "user_123" });
		expect(setActiveOrg).toHaveBeenCalledWith("org_123");
	});

	test("does not start another impersonation when restoring admin fails", async () => {
		stopError = { message: "Unable to restore admin session" };
		await impersonateUser({
			userId: "user_123",
			isCurrentlyImpersonating: true,
		});
		expect(calls).toEqual(["stop"]);
		expect(toastError).toHaveBeenCalledWith("Unable to restore admin session");
	});

	test("does not stop a regular admin session", async () => {
		await impersonateUser({ userId: "user_123" });
		expect(calls).toEqual(["impersonate", "reload"]);
	});
});
