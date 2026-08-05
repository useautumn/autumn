import { afterAll, expect, mock, test } from "bun:test";
import { ApiVersion, type CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createHonoApp } from "@/initHono.js";
import type { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";

const GET_FULL_SUBJECT_MODULE =
	"@/internal/customers/repos/getFullSubject/index.js";

// Dynamic import so the real implementation stays reachable after mock.module
// swaps the module's exports.
const realGetFullSubjectModule: {
	getFullSubjectNormalized: typeof getFullSubjectNormalized;
} & Record<string, unknown> = await import(GET_FULL_SUBJECT_MODULE);

/** Customers whose DB hydration must throw a retryable driver error. */
const outageCustomerIds = new Set<string>();

// Both /check hydration paths (V2_1 partial + legacy) load the subject through
// this module, so it is the only seam where a DB outage can be injected.
mock.module(GET_FULL_SUBJECT_MODULE, () => ({
	...realGetFullSubjectModule,
	getFullSubjectNormalized: async (
		args: Parameters<typeof getFullSubjectNormalized>[0],
	) => {
		if (args.customerId && outageCustomerIds.has(args.customerId)) {
			const error = new Error("simulated db outage") as Error & {
				code: string;
			};
			error.code = "CONNECT_TIMEOUT";
			throw error;
		}
		return realGetFullSubjectModule.getFullSubjectNormalized(args);
	},
}));

afterAll(() => {
	outageCustomerIds.clear();
	mock.module(GET_FULL_SUBJECT_MODULE, () => realGetFullSubjectModule);
});

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

	const app = createHonoApp();

	try {
		outageCustomerIds.add(customerId);

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
		outageCustomerIds.delete(customerId);
	}
});

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

	const app = createHonoApp();

	try {
		outageCustomerIds.add(customerId);

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
		// Fail-open stays allowed: true through the V1_Beta converter.
		expect(await response.json()).toEqual({
			allowed: true,
			code: "feature_found",
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: undefined,
			required_balance: 1,
		});
	} finally {
		outageCustomerIds.delete(customerId);
	}
});
