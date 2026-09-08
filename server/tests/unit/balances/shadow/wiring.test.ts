import { afterAll, expect, mock, test } from "bun:test";
import { ApiVersion, type TrackResponseV3 } from "@autumn/shared";
import type { BalanceShadowTrack } from "@/internal/balances/shadow/balanceShadowTypes.js";
import { createBalanceShadow } from "@/internal/balances/shadow/createBalanceShadow.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

const fixture = createCustomerFixture();
const copies: BalanceShadowTrack[] = [];
const sourceCalls: Record<string, unknown>[] = [];
const response: TrackResponseV3 = {
	customer_id: "cus_test",
	value: 5,
	balance: null,
};
const mirror = createBalanceShadow({
	dependencies: {
		client: {
			track: async () => {
				throw new Error("not used");
			},
		},
		report: () => undefined,
	},
});
const session = {
	config: {
		runId: "wiring",
		ownershipTopic: "shadow",
		expiresAt: Date.now() + 60_000,
		customers: [
			{
				orgId: fixture.ctx.org.id,
				env: fixture.ctx.env,
				customerId: "cus_test",
				featureId: "messages",
			},
		],
	},
	mirror: {
		...mirror,
		submit: (copy: BalanceShadowTrack) => {
			copies.push(copy);
			return true;
		},
	},
};
await mockModuleWithRestore(
	"@/external/balanceWorker/balanceShadow.js",
	() => ({ getBalanceShadowSession: () => session }),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({ getOrSetCachedFullSubject: async () => fixture.fullSubject }),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js",
	() => ({ getOrCreateCachedFullSubject: async () => fixture.fullSubject }),
);
await mockModuleWithRestore(
	"@/internal/balances/track/v3/runRedisTrackV3.js",
	() => ({
		runRedisTrackV3: async (args: Record<string, unknown>) => {
			sourceCalls.push(args);
			return response;
		},
	}),
);
const { runTrackV3 } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/track/v3/runTrackV3.js?shadow-wiring"
);
await mockModuleWithRestore(
	"@/internal/balances/track/utils/getFeatureDeductions.js",
	() => ({ getTrackFeatureDeductionsForBody: () => [] }),
);
await mockModuleWithRestore(
	"@/internal/misc/idempotency/withIdempotencyKey.js",
	() => ({
		withIdempotencyKey: ({ run }: { run: () => Promise<unknown> }) => run(),
	}),
);
const { runQueuedTrack } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/balances/track/runQueuedTrack.js?shadow-wiring"
);
afterAll(async () => {
	mock.restore();
	await mirror.stop();
});

test.concurrent(
	"the shared sync and queued track execution hook copies once without changing Redis arguments",
	async () => {
		const body = {
			customer_id: "cus_test",
			feature_id: "messages",
			value: 5,
			idempotency_key: "request-key",
		};
		const featureDeductions = [
			{ feature: { id: "messages" }, deduction: 5 },
		] as FeatureDeduction[];
		const result = await runTrackV3({
			ctx: fixture.ctx,
			body,
			featureDeductions,
			apiVersion: ApiVersion.V2_1,
		});
		expect(copies).toHaveLength(1);
		expect(copies[0]).toMatchObject({
			command: { identity: { customerId: "cus_test" }, value: 5 },
			source: { kind: "returned" },
		});
		expect(sourceCalls).toHaveLength(1);
		expect(sourceCalls[0]).toMatchObject({
			body,
			fullSubject: fixture.fullSubject,
			featureDeductions,
			overageBehavior: "cap",
		});
		expect(result).toEqual(response);
		await runQueuedTrack({
			ctx: fixture.ctx,
			body,
			apiVersion: ApiVersion.V2_1,
		});
		expect(copies).toHaveLength(2);
		expect(sourceCalls).toHaveLength(2);
		expect(copies[1].command.commandId).toBe(copies[0].command.commandId);
	},
);
