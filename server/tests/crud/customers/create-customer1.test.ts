import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusExpand } from "@autumn/shared";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const testCase = "create-customer1";
const customerId = testCase;

describe(`${chalk.yellowBright("create-customer1: Testing create customer")}`, () => {
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
