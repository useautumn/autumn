import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusExpand } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "create-customer2";
const customerId = testCase;

describe(`${chalk.yellowBright("create-customer2: Testing create customer concurrently (should have no race conditions)")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		try {
			await autumnV1.customers.delete(customerId);
		} catch {}
	});

	test("should create customer with expand params", async () => {
		const [data1, data2] = await Promise.all([
			autumnV1.customers.create({
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
				withAutumnId: false,
			}),
			autumnV1.customers.create({
				id: customerId,
				name: customerId,
				email: `${customerId}@example.com`,
				withAutumnId: false,
			}),
		]);

		expect(data1.id).toBe(customerId);
		expect(data1.name).toBe(customerId);
		expect(data1.email).toBe(`${customerId}@example.com`);
		expect(data1.autumn_id).toBeUndefined();

		expect(data2.id).toBe(customerId);
		expect(data2.name).toBe(customerId);
		expect(data2.email).toBe(`${customerId}@example.com`);
		expect(data2.autumn_id).toBeUndefined();
	});

	test("should return customer when call again", async () => {
		const data = await autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			withAutumnId: false,
		});

		expect(data.id).toBe(customerId);
		expect(data.name).toBe(customerId);
		expect(data.email).toBe(`${customerId}@example.com`);
		expect(data.autumn_id).toBeUndefined();
	});

	test("should return expanded params if provided", async () => {
		const data = await autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			withAutumnId: false,
			expand: [CusExpand.Invoices, CusExpand.TrialsUsed, CusExpand.Entities],
		});

		expect(data.invoices).toEqual([]);
		expect(data.trials_used).toEqual([]);
		expect(data.entities).toEqual([]);
	});
});
