import { expect, test } from "bun:test";
import { computeCheck, type InitializeCommand } from "@autumn/balance-engine";
import type { BalanceShadowConfig } from "@/internal/balances/shadow/balanceShadowTypes.js";
import { runBalanceShadowCohort } from "@/internal/balances/shadow/operator/runBalanceShadowCohort.js";
import { parseShadowOperatorArgs } from "../../../../../scripts/balance-shadow/parseShadowOperatorArgs.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

test.concurrent(
	"operator requires a quiet cohort and never enables initialization implicitly",
	() => {
		expect(() => parseShadowOperatorArgs({ args: [] })).toThrow(
			"confirm-quiet",
		);
		expect(
			parseShadowOperatorArgs({
				args: ["--mode", "initialize", "--confirm-quiet"],
			}),
		).toMatchObject({ mode: "initialize", execute: false });
		expect(
			parseShadowOperatorArgs({ args: ["--confirm-quiet"] }),
		).toMatchObject({ mode: "compare", execute: false });
		for (const args of [
			["--mode", "wipe"],
			["--mode", "compare", "--execute"],
			["--unknown"],
		])
			expect(() => parseShadowOperatorArgs({ args })).toThrow();
		expect(parseShadowOperatorArgs({ args: ["--help"] })).toEqual({
			help: true,
		});
	},
);

test.concurrent(
	"cohort waits for ownership and initializes all features of a customer once",
	async () => {
		const { ctx, fullSubject, customerEntitlement } = createCustomerFixture();
		const tokens = structuredClone(customerEntitlement);
		tokens.id = "tokens_grant";
		tokens.entitlement.feature.id = "tokens";
		fullSubject.customer_products[0].customer_entitlements.push(tokens);
		const identity = {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: "cus_test",
		};
		const config: BalanceShadowConfig = {
			runId: "grouped",
			ownershipTopic: "shadow",
			expiresAt: ctx.timestamp + 60_000,
			customers: ["messages", "tokens"].map((featureId) => ({
				...identity,
				featureId,
			})),
		};
		const calls: string[] = [];
		let initialization: InitializeCommand | undefined;
		const results = await runBalanceShadowCohort({
			config,
			mode: "initialize",
			execute: true,
			dependencies: {
				owners: {
					start: async () => {
						calls.push("ready");
					},
					stop: async () => {
						calls.push("stop");
					},
				},
				loadContext: async () => {
					calls.push("load");
					return ctx;
				},
				loadSubject: async () => structuredClone(fullSubject),
				client: {
					initialize: async ({ command }) => {
						calls.push("initialize");
						initialization = command;
						return { kind: "initialized", state: command.state };
					},
					check: async ({ command }) =>
						computeCheck({ state: initialization!.state, command }),
				},
				report: () => {
					calls.push("report");
				},
			},
		});
		expect(calls).toEqual(["ready", "load", "initialize", "report", "stop"]);
		expect(Object.keys(initialization!.state.featureStatesById)).toEqual([
			"messages",
			"tokens",
		]);
		expect(initialization!.identity).toEqual(identity);
		expect(results).toMatchObject([
			{ status: "equal_at_read", featureIds: ["messages", "tokens"] },
		]);
	},
);

test.concurrent(
	"cohort closes ownership on startup and reporting failures",
	async () => {
		const { ctx, fullSubject } = createCustomerFixture();
		const config: BalanceShadowConfig = {
			runId: "failure",
			ownershipTopic: "shadow",
			expiresAt: ctx.timestamp + 60_000,
			customers: [
				{
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: "cus_test",
					featureId: "messages",
				},
			],
		};
		for (const failStartup of [true, false]) {
			const calls: string[] = [];
			await expect(
				runBalanceShadowCohort({
					config,
					mode: "initialize",
					dependencies: {
						owners: {
							start: async () => {
								if (failStartup) throw new Error("startup");
							},
							stop: async () => {
								calls.push("stop");
							},
						},
						loadContext: async () => {
							calls.push("load");
							return ctx;
						},
						loadSubject: async () => fullSubject,
						client: {
							initialize: async () => {
								throw new Error("must not initialize");
							},
							check: async () => {
								throw new Error("must not check");
							},
						},
						report: () => {
							throw new Error("reporting");
						},
					},
				}),
			).rejects.toThrow(failStartup ? "startup" : "reporting");
			expect(calls).toEqual(failStartup ? ["stop"] : ["load", "stop"]);
		}
	},
);
