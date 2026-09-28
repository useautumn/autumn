import { expect, test } from "bun:test";
import { prepareBalanceShadowTrack } from "@/internal/balances/shadow/prepareBalanceShadowTrack.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

function createFixture() {
	const fixture = createCustomerFixture();
	return {
		...fixture,
		body: {
			customer_id: "cus_test",
			feature_id: "messages",
			value: 5,
			idempotency_key: "key",
		},
		now: fixture.ctx.timestamp,
		config: {
			runId: "trial-1",
			ownershipTopic: "shadow-ownership",
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
	};
}

test.concurrent(
	"cohort selection is exact and command identity survives retries",
	() => {
		const fixture = createFixture();
		const first = prepareBalanceShadowTrack(fixture);
		const retry = prepareBalanceShadowTrack({
			...fixture,
			ctx: { ...fixture.ctx, id: "retry" },
		});
		expect(first).toMatchObject({
			kind: "copy",
			command: {
				commandId: JSON.stringify([
					"shadow",
					"trial-1",
					JSON.stringify(["track", "key"]),
				]),
				identity: { customerId: "cus_test" },
				value: 5,
			},
		});
		if (first.kind === "copy" && retry.kind === "copy")
			expect(retry.command.commandId).toBe(first.command.commandId);
		for (const identity of [
			{ orgId: "other" },
			{ env: "live" as const },
			{ customerId: "other" },
			{ featureId: "other" },
		]) {
			const config = {
				...fixture.config,
				customers: [{ ...fixture.config.customers[0], ...identity }],
			};
			expect(prepareBalanceShadowTrack({ ...fixture, config })).toEqual({
				kind: "ignore",
			});
		}
	},
);

test.concurrent(
	"unsupported requests are reported, not guessed or used to reseed the worker",
	() => {
		for (const body of [
			{ value: -1 },
			{ properties: { model: "x" } },
			{ entity_id: "entity" },
			{ event_name: "message.sent", feature_id: undefined },
		]) {
			const fixture = createFixture();
			expect(
				prepareBalanceShadowTrack({
					...fixture,
					body: { ...fixture.body, ...body },
				}),
			).toMatchObject({ kind: "skip", reason: expect.any(String) });
		}
		const fixture = createFixture();
		fixture.customerEntitlement.balance = -1;
		expect(prepareBalanceShadowTrack(fixture)).toMatchObject({ kind: "skip" });
	},
);

test.concurrent(
	"expired runs and upcoming lifecycle boundaries end this comparison window",
	() => {
		const fixture = createFixture();
		expect(
			prepareBalanceShadowTrack({ ...fixture, now: fixture.config.expiresAt }),
		).toEqual({ kind: "skip", reason: "window_expired" });
		fixture.customerEntitlement.next_reset_at = fixture.config.expiresAt - 1;
		expect(prepareBalanceShadowTrack(fixture)).toEqual({
			kind: "skip",
			reason: "lifecycle_within_window",
		});
	},
);
