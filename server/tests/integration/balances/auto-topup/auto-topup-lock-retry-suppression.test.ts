/** Red: lock contention clears suppression and emits failure. Green: it keeps suppression and retries silently. */

import { beforeEach, expect, mock, test } from "bun:test";
import { AppEnv, ErrCode } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const calls = {
	clearPending: 0,
	keepPending: [] as number[],
	failureWebhook: 0,
};
const state = { lockContention: true, preflightBlocked: false };

mock.module("@/external/redis/redisUtils.js", () => ({
	withLock: async ({ fn }: { fn: () => Promise<void> }) => {
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
		buildAutoTopupPendingKey: () => "auto_topup:pending:test",
		clearAutoTopupPendingKey: async () => {
			calls.clearPending++;
		},
		enqueueAutoTopupWithBurstSuppression: async () => ({
			enqueued: false,
			reason: "pending_key_exists" as const,
		}),
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
	expect(calls.keepPending).toEqual([10 * 60 * 1000]);
	expect(calls.failureWebhook).toBe(0);
});

test("auto-topup purchase limit preserves burst suppression", async () => {
	state.lockContention = false;
	state.preflightBlocked = true;

	await autoTopup({ ctx, payload });

	expect(calls.clearPending).toBe(0);
	expect(calls.keepPending).toEqual([10 * 60 * 1000]);
	expect(calls.failureWebhook).toBe(1);
});
