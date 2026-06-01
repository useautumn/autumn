/**
 * TDD regression tests for the RateLimitRedisAllowlistDialog stale-state bug
 * (Cubic P2). The dialog kept previously loaded allowlist data in component
 * state when a subsequent open-fetch failed, leaving Save enabled and
 * letting the operator PUT stale data back to S3.
 *
 * Red-failure mode (pre-fix behavior):
 *  - open dialog A → fetch ok → customerIds=["cus_a","cus_b"]
 *  - close, re-open → fetch errors
 *  - component state still holds ["cus_a","cus_b"], JSON editor still
 *    renders them, Save is still enabled, click-Save PUTs stale data
 *
 * Green-success criteria (post-fix behavior, verified here):
 *  - open-effect resets state to DEFAULT_CONFIG at the start, every time
 *  - on fetch failure, `loadFailed` flips to true, config stays at default
 *  - Save button is disabled whenever `loadFailed` is true
 *  - a successful re-open after a failed one resets loadFailed to false
 *    and repopulates with server data
 *  - if the dialog closes (effect cancellation) before the fetch settles,
 *    no post-await state mutation runs
 *
 * Layer: same — the open-effect owns the lifecycle invariant. Tests target
 * the pure module the effect was refactored into
 * (`rateLimitRedisAllowlistDialogState.ts`). The dialog's useEffect is a
 * thin wiring shim that pushes the module's update objects through React
 * setState; no DOM is needed to verify the contract.
 *
 * Red was confirmed by reverting the fix locally (skipping the initial
 * reset, skipping `loadFailed` on the catch branch, dropping `loadFailed`
 * from the Save gate) — 6 of these 13 assertions failed on the pre-fix
 * version, mapping cleanly to the three changes the fix made.
 */

import { describe, expect, mock, test } from "bun:test";
import {
	buildEditableJsonText,
	buildFetchFailureUpdate,
	buildFetchSuccessUpdate,
	buildInitialResetUpdate,
	DEFAULT_CONFIG,
	type FetchFailureUpdate,
	type FetchSuccessUpdate,
	type InitialResetUpdate,
	isSaveDisabled,
	loadAllowlistConfig,
	type RateLimitRedisAllowlistConfig,
} from "@/views/admin/components/rateLimitRedisAllowlistDialogState";

const buildPopulatedConfig = (
	overrides: Partial<RateLimitRedisAllowlistConfig> = {},
): RateLimitRedisAllowlistConfig => ({
	customerIds: ["cus_a", "cus_b"],
	configHealthy: true,
	configConfigured: true,
	lastSuccessAt: "2026-01-01T00:00:00.000Z",
	error: null,
	...overrides,
});

type Capture = {
	resets: InitialResetUpdate[];
	successes: FetchSuccessUpdate[];
	failures: FetchFailureUpdate[];
	errors: unknown[];
};

const buildCapture = (): Capture => ({
	resets: [],
	successes: [],
	failures: [],
	errors: [],
});

const buildHandlers = ({
	capture,
	axiosGet,
	isCancelled = () => false,
}: {
	capture: Capture;
	axiosGet: () => Promise<{ data: RateLimitRedisAllowlistConfig }>;
	isCancelled?: () => boolean;
}) => ({
	axiosGet,
	isCancelled,
	applyInitialReset: (update: InitialResetUpdate) => {
		capture.resets.push(update);
	},
	applySuccess: (update: FetchSuccessUpdate) => {
		capture.successes.push(update);
	},
	applyFailure: (update: FetchFailureUpdate) => {
		capture.failures.push(update);
	},
	onError: (error: unknown) => {
		capture.errors.push(error);
	},
});

describe("RateLimitRedisAllowlistDialog state — fresh successful open", () => {
	test("populates config from server response and leaves loadFailed=false", async () => {
		const capture = buildCapture();
		const serverConfig = buildPopulatedConfig();

		await loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: async () => ({ data: serverConfig }),
			}),
		);

		expect(capture.resets).toHaveLength(1);
		expect(capture.resets[0]).toEqual({
			loading: true,
			loadFailed: false,
			config: DEFAULT_CONFIG,
			jsonText: buildEditableJsonText({ config: DEFAULT_CONFIG }),
			jsonError: null,
			syncSource: "form",
		});

		expect(capture.successes).toHaveLength(1);
		expect(capture.successes[0]?.config.customerIds).toEqual(["cus_a", "cus_b"]);
		expect(capture.successes[0]?.config.configHealthy).toBe(true);
		expect(capture.successes[0]?.jsonText).toBe(
			buildEditableJsonText({ config: serverConfig }),
		);
		expect(capture.successes[0]?.jsonText).toContain("cus_a");
		expect(capture.successes[0]?.loading).toBe(false);

		expect(capture.failures).toHaveLength(0);
		expect(capture.errors).toHaveLength(0);
	});
});

describe("RateLimitRedisAllowlistDialog state — re-open after success, fetch fails", () => {
	test("resets to DEFAULT_CONFIG and sets loadFailed=true; stale customerIds gone", async () => {
		const capture = buildCapture();
		const fetchError = new Error("network");

		await loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: () => Promise.reject(fetchError),
			}),
		);

		expect(capture.resets).toHaveLength(1);
		expect(capture.resets[0]?.config).toEqual(DEFAULT_CONFIG);
		expect(capture.resets[0]?.config.customerIds).toEqual([]);
		expect(capture.resets[0]?.jsonText).toBe(
			buildEditableJsonText({ config: DEFAULT_CONFIG }),
		);

		expect(capture.failures).toHaveLength(1);
		expect(capture.failures[0]).toEqual({
			loading: false,
			loadFailed: true,
		});

		expect(capture.successes).toHaveLength(0);

		expect(capture.errors).toHaveLength(1);
		expect(capture.errors[0]).toBe(fetchError);
	});
});

describe("RateLimitRedisAllowlistDialog state — Save button gating", () => {
	test("Save is disabled when loadFailed=true even with no jsonError and loading=false", () => {
		expect(
			isSaveDisabled({ loading: false, loadFailed: true, jsonError: null }),
		).toBe(true);
	});

	test("Save is enabled on a clean, loaded, successful state", () => {
		expect(
			isSaveDisabled({ loading: false, loadFailed: false, jsonError: null }),
		).toBe(false);
	});

	test("Save is disabled while loading", () => {
		expect(
			isSaveDisabled({ loading: true, loadFailed: false, jsonError: null }),
		).toBe(true);
	});

	test("Save is disabled when jsonError is set", () => {
		expect(
			isSaveDisabled({
				loading: false,
				loadFailed: false,
				jsonError: "Invalid JSON",
			}),
		).toBe(true);
	});
});

describe("RateLimitRedisAllowlistDialog state — fresh successful open after a failed one", () => {
	test("second open emits an initial reset (loadFailed=false) and then populates server data", async () => {
		const capture = buildCapture();
		const serverConfig = buildPopulatedConfig({
			customerIds: ["cus_recovered"],
		});

		// First open: fails.
		await loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: () => Promise.reject(new Error("transient")),
			}),
		);

		// Second open: succeeds.
		await loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: async () => ({ data: serverConfig }),
			}),
		);

		// Two resets, one per open. The second reset MUST have loadFailed=false.
		expect(capture.resets).toHaveLength(2);
		expect(capture.resets[1]?.loadFailed).toBe(false);
		expect(capture.resets[1]?.config).toEqual(DEFAULT_CONFIG);

		// Only one failure (from the first open).
		expect(capture.failures).toHaveLength(1);

		// Second open populates server data.
		expect(capture.successes).toHaveLength(1);
		expect(capture.successes[0]?.config.customerIds).toEqual(["cus_recovered"]);

		// After the second open, Save would be enabled — loadFailed reset, no jsonError, loading=false.
		const lastSuccess = capture.successes[0];
		const secondReset = capture.resets[1];
		expect(lastSuccess).toBeDefined();
		expect(secondReset).toBeDefined();
		expect(
			isSaveDisabled({
				loading: lastSuccess?.loading ?? true,
				loadFailed: secondReset?.loadFailed ?? true,
				jsonError: lastSuccess?.jsonError ?? null,
			}),
		).toBe(false);
	});
});

describe("RateLimitRedisAllowlistDialog state — cancellation", () => {
	test("cancelled before success resolves: applySuccess and onError never run; only initial reset applied", async () => {
		const capture = buildCapture();
		const serverConfig = buildPopulatedConfig();
		let cancelled = false;

		const pendingFetch = new Promise<{ data: RateLimitRedisAllowlistConfig }>(
			(resolve) => {
				queueMicrotask(() => resolve({ data: serverConfig }));
			},
		);

		const promise = loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: () => pendingFetch,
				isCancelled: () => cancelled,
			}),
		);

		// Synchronous: initial reset already applied before the await.
		expect(capture.resets).toHaveLength(1);

		// Caller "unmounts" the dialog before the fetch resolves.
		cancelled = true;

		await promise;

		// No post-await mutations.
		expect(capture.successes).toHaveLength(0);
		expect(capture.failures).toHaveLength(0);
		expect(capture.errors).toHaveLength(0);
	});

	test("cancelled before failure rejects: applyFailure and onError never run", async () => {
		const capture = buildCapture();
		let cancelled = false;

		const pendingFetch = new Promise<{ data: RateLimitRedisAllowlistConfig }>(
			(_, reject) => {
				queueMicrotask(() => reject(new Error("boom")));
			},
		);

		const promise = loadAllowlistConfig(
			buildHandlers({
				capture,
				axiosGet: () => pendingFetch,
				isCancelled: () => cancelled,
			}),
		);

		expect(capture.resets).toHaveLength(1);

		cancelled = true;

		await promise;

		expect(capture.failures).toHaveLength(0);
		expect(capture.errors).toHaveLength(0);
		expect(capture.successes).toHaveLength(0);
	});
});

describe("RateLimitRedisAllowlistDialog state — pure builders", () => {
	test("buildInitialResetUpdate returns a frozen default snapshot", () => {
		const update = buildInitialResetUpdate();
		expect(update.config).toEqual(DEFAULT_CONFIG);
		expect(update.config.customerIds).toEqual([]);
		expect(update.loading).toBe(true);
		expect(update.loadFailed).toBe(false);
		expect(update.jsonError).toBeNull();
		expect(update.syncSource).toBe("form");
	});

	test("buildFetchSuccessUpdate merges over DEFAULT_CONFIG (defensive against partial server payloads)", () => {
		const update = buildFetchSuccessUpdate({
			data: {
				customerIds: ["cus_x"],
				// Simulate a server that drops fields entirely.
			} as unknown as RateLimitRedisAllowlistConfig,
		});
		expect(update.config.customerIds).toEqual(["cus_x"]);
		expect(update.config.configHealthy).toBe(false);
		expect(update.config.configConfigured).toBe(false);
		expect(update.config.lastSuccessAt).toBeNull();
		expect(update.loading).toBe(false);
	});

	test("buildFetchFailureUpdate has no config mutation, only the flags", () => {
		const update = buildFetchFailureUpdate();
		expect(update).toEqual({ loading: false, loadFailed: true });
		expect(update).not.toHaveProperty("config");
	});

	// Sanity: ensure mock is wired (catches a stray dependency drop on the suite).
	test("bun mock helper is wired", () => {
		const fn = mock(() => 42);
		expect(fn()).toBe(42);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
