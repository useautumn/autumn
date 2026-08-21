/** Red: lock contention clears suppression and emits failure. Green: it keeps suppression and retries silently. */

import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const calls = {
	clearPending: 0,
	keepPending: [] as number[],
	failureWebhook: 0,
	lockTtlMs: [] as number[],
};
const state = { lockContention: true, preflightBlocked: false };

mock.module("@/external/redis/utils/lockUtils/withLock.js", () => ({
	withLock: async ({
		fn,
		ttlMs,
	}: {
		fn: () => Promise<void>;
		ttlMs?: number;
	}) => {
		if (ttlMs != null) calls.lockTtlMs.push(ttlMs);
		if (state.lockContention) throw { code: ErrCode.LockAlreadyExists };
		return fn();
	},
}));

mock.module(
	"@/internal/balances/autoTopUp/setup/setupAutoTopupContext.js",
	() => ({
		setupAutoTopupContext: async () => {
			if (state.preflightBlocked) {
				return {
					ok: false,
					failure: {
						reason: "purchase_limit_reached",
						suppressionTtlMs: 60 * 60 * 1000,
					},
				};
			}
			throw new Error("Unexpected auto-topup setup");
		},
	}),
);

mock.module(
	"@/internal/balances/autoTopUp/helpers/enqueueAutoTopupWithBurstSuppression.js",
	() => ({
		enqueueAutoTopupWithBurstSuppression: async () => ({
			enqueued: false,
			reason: "pending_key_exists" as const,
		}),
	}),
);

mock.module(
	"@/external/redis/actions/autoTopUpSuppression/autoTopUpSuppression.js",
	() => ({
		buildAutoTopupPendingKey: () => "auto_topup:pending:test",
		clearAutoTopupPendingKey: async () => {
			calls.clearPending++;
		},
		keepAutoTopupPendingKey: async ({ ttlMs }: { ttlMs: number }) => {
			calls.keepPending.push(ttlMs);
		},
	}),
);

mock.module(
	"@/internal/balances/autoTopUp/webhooks/sendAutoTopupFailedWebhook.js",
	() => ({
		classifyAutoTopupError: () => ({ reason: "lock_contention" }),
		sendAutoTopupFailedWebhook: async () => {
			calls.failureWebhook++;
		},
	}),
);

const { autoTopup } = await import(
	"@/internal/balances/autoTopUp/autoTopup.js"
);

beforeEach(() => {
	calls.clearPending = 0;
	calls.keepPending = [];
	calls.failureWebhook = 0;
	calls.lockTtlMs = [];
	state.lockContention = true;
	state.preflightBlocked = false;
});

const ctx = {
	org: { id: "org_test", config: {} },
	env: AppEnv.Live,
	logger: { info: () => undefined },
} as unknown as AutumnContext;

const payload = {
	orgId: ctx.org.id,
	env: ctx.env,
	customerId: "cus_test",
	featureId: "messages",
};

test("auto-topup lock retry preserves burst suppression", async () => {
	await expect(autoTopup({ ctx, payload })).rejects.toMatchObject({
		code: ErrCode.LockAlreadyExists,
	});

	expect(calls.clearPending).toBe(0);
	expect(calls.keepPending).toEqual([25 * 60 * 1000]);
	expect(calls.failureWebhook).toBe(0);
	expect(calls.lockTtlMs).toEqual([5 * 60 * 1000]);
});

test("auto-topup purchase limit preserves burst suppression", async () => {
	state.lockContention = false;
	state.preflightBlocked = true;

	await autoTopup({ ctx, payload });

	expect(calls.clearPending).toBe(0);
	expect(calls.keepPending).toEqual([25 * 60 * 1000]);
	expect(calls.failureWebhook).toBe(1);
});
