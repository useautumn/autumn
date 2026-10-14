import { expect, test } from "bun:test";
import { ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("create-balance invalid params: each feature rule returns 400 with its reason")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "create-balance-invalid-params",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const cases = [
			{
				params: { feature_id: TestFeature.Messages },
				message: "included_grant or unlimited is required",
			},
			{
				params: {
					feature_id: TestFeature.Messages,
					included_grant: 10,
					unlimited: true,
				},
				message: "included_grant cannot be combined with unlimited",
			},
			{
				params: {
					feature_id: TestFeature.Messages,
					unlimited: true,
					reset: { interval: ResetInterval.Month },
				},
				message: "reset cannot be combined with unlimited",
			},
			{
				params: { feature_id: TestFeature.Dashboard, included_grant: 10 },
				message: "boolean features cannot have included_grant",
			},
			{
				params: { feature_id: TestFeature.Dashboard, unlimited: true },
				message: "boolean features cannot be unlimited",
			},
			{
				params: {
					feature_id: TestFeature.Dashboard,
					reset: { interval: ResetInterval.Month },
				},
				message: "boolean features cannot have reset",
			},
		];

		for (const { params, message } of cases) {
			const res = await fetch(`${autumnV2.baseUrl}/balances/create`, {
				method: "POST",
				headers: autumnV2.headers,
				body: JSON.stringify({ customer_id: customerId, ...params }),
			});
			const body = await res.json();

			expect(res.status).toBe(400);
			expect(body.code).toBe(ErrCode.InvalidInputs);
			expect(body.message).toInclude(message);
		}
	},
);
