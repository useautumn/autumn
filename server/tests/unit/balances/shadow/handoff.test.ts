import { expect, test } from "bun:test";
import { InsufficientBalanceError, type TrackResponseV3 } from "@autumn/shared";
import type { BalanceShadowTrack } from "@/internal/balances/shadow/balanceShadowTypes.js";
import { runWithBalanceShadow } from "@/internal/balances/shadow/runWithBalanceShadow.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

function createFixture() {
	const fixture = createCustomerFixture();
	const copies: BalanceShadowTrack[] = [];
	const events: Record<string, unknown>[] = [];
	const session = {
		config: {
			runId: "trial",
			ownershipTopic: "shadow",
			expiresAt: fixture.ctx.timestamp + 60_000,
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
			submit: (copy: BalanceShadowTrack) => {
				copies.push(copy);
				return true;
			},
			record: (event: Record<string, unknown>) => events.push(event),
			status: () => ({
				submitted: 0,
				completed: 0,
				failed: 0,
				dropped: 0,
				pending: 0,
				inFlight: 0,
			}),
			stop: async () => undefined,
		},
	};
	return {
		...fixture,
		copies,
		events,
		session,
		now: () => fixture.ctx.timestamp,
		body: { customer_id: "cus_test", feature_id: "messages", value: 5 },
	};
}

test.concurrent(
	"live responses and request objects are unchanged; disabled shadow does nothing",
	async () => {
		const fixture = createFixture();
		const response: TrackResponseV3 = {
			customer_id: "cus_test",
			value: 5,
			balance: null,
		};
		const body = structuredClone(fixture.body);
		expect(
			await runWithBalanceShadow({ ...fixture, run: async () => response }),
		).toBe(response);
		expect(fixture.copies).toHaveLength(1);
		expect(fixture.body).toEqual(body);
		expect(
			await runWithBalanceShadow({
				...fixture,
				session: undefined,
				run: async () => response,
			}),
		).toBe(response);
		expect(fixture.copies).toHaveLength(1);
	},
);

test.concurrent(
	"a live rejection is mirrored, while an unknown failure is reported and rethrown unchanged",
	async () => {
		const fixture = createFixture();
		const rejected = new InsufficientBalanceError({
			featureId: "messages",
			value: 5,
		});
		await expect(
			runWithBalanceShadow({
				...fixture,
				run: async () => {
					throw rejected;
				},
			}),
		).rejects.toBe(rejected);
		expect(fixture.copies).toMatchObject([{ source: { kind: "rejected" } }]);
		const failure = new Error("Redis unavailable");
		await expect(
			runWithBalanceShadow({
				...fixture,
				run: async () => {
					throw failure;
				},
			}),
		).rejects.toBe(failure);
		expect(fixture.copies).toHaveLength(1);
		expect(fixture.events).toContainEqual(
			expect.objectContaining({ event: "skipped", reason: "live_failure" }),
		);
	},
);

test.concurrent(
	"a broken shadow callback cannot replace a successful live response or its error",
	async () => {
		const fixture = createFixture();
		fixture.session.mirror.submit = () => {
			throw new Error("copy failure");
		};
		fixture.session.mirror.record = () => {
			throw new Error("logging failure");
		};
		const response: TrackResponseV3 = {
			customer_id: "cus_test",
			value: 5,
			balance: null,
		};
		expect(
			await runWithBalanceShadow({ ...fixture, run: async () => response }),
		).toBe(response);
		const rejected = new InsufficientBalanceError({
			featureId: "messages",
			value: 5,
		});
		await expect(
			runWithBalanceShadow({
				...fixture,
				run: async () => {
					throw rejected;
				},
			}),
		).rejects.toBe(rejected);
	},
);
