import { expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createHonoApp } from "@/initHono.js";
import { CusService } from "@/internal/customers/CusService.js";

test(`${chalk.yellowBright("check-fallback: /check returns allowed=true on retryable customer load failure")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "check-fallback-free",
		items: [messagesItem],
	});

	const { customerId } = await initScenario({
		customerId: "check-fallback",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const originalGetFull = CusService.getFull;
	const app = createHonoApp();

	try {
		CusService.getFull = (async () => {
			const error = new Error("simulated db outage") as Error & {
				code: string;
			};
			error.code = "CONNECT_TIMEOUT";
			throw error;
		}) as typeof CusService.getFull;

		const response = await app.fetch(
			new Request("http://localhost/v1/balances.check", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.UNIT_TEST_AUTUMN_SECRET_KEY || ""}`,
					"Content-Type": "application/json",
					"x-api-version": ApiVersion.V2_1.toString(),
					"x-skip-cache": "true",
				},
				body: JSON.stringify({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				}),
			}),
		);

		const body = (await response.json()) as CheckResponseV3;

		expect(response.status).toBe(202);
		expect(body).toEqual({
			allowed: true,
			customer_id: customerId,
			entity_id: undefined,
			required_balance: 1,
			balance: null,
			flag: null,
		});
	} finally {
		CusService.getFull = originalGetFull;
	}
}, 20000);

test(`${chalk.yellowBright("check-fallback-legacy: /check fallback applies response version transforms")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const freeProd = products.base({
		id: "check-fallback-legacy-free",
		items: [messagesItem],
	});

	const { customerId } = await initScenario({
		customerId: "check-fallback-legacy",
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const originalGetFull = CusService.getFull;
	const app = createHonoApp();

	try {
		CusService.getFull = (async () => {
			const error = new Error("simulated db outage") as Error & {
				code: string;
			};
			error.code = "CONNECT_TIMEOUT";
			throw error;
		}) as typeof CusService.getFull;

		const response = await app.fetch(
			new Request("http://localhost/v1/balances.check", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.UNIT_TEST_AUTUMN_SECRET_KEY || ""}`,
					"Content-Type": "application/json",
					"x-api-version": ApiVersion.V1_Beta.toString(),
					"x-skip-cache": "true",
				},
				body: JSON.stringify({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				}),
			}),
		);

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({
			allowed: false,
			code: "feature_found",
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: undefined,
			required_balance: 1,
		});
	} finally {
		CusService.getFull = originalGetFull;
	}
}, 20000);
