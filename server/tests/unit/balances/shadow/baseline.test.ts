import { expect, test } from "bun:test";
import type { Redis } from "ioredis";
import { readBalanceShadowSubject } from "@/internal/balances/shadow/operator/readBalanceShadowSubject.js";
import { FULL_SUBJECT_CACHE_SCHEMA_VERSION } from "@/internal/customers/cache/fullSubject/fullSubjectCacheModel.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

function setup() {
	const fixture = createCustomerFixture();
	const { ctx, customer, customerProduct, customerEntitlement } = fixture;
	const cached = {
		_schemaVersion: FULL_SUBJECT_CACHE_SCHEMA_VERSION,
		_cachedAt: ctx.timestamp,
		subjectViewEpoch: 1,
		subjectType: fixture.fullSubject.subjectType,
		customerId: "cus_test",
		internalCustomerId: customer.internal_id,
		customer,
		customer_products: [customerProduct],
		customer_prices: customerProduct.customer_prices,
		products: [customerProduct.product],
		entitlements: [customerEntitlement.entitlement],
		prices: customerProduct.customer_prices.map(({ price }) => price),
		flags: {},
		free_trials: [],
		subscriptions: [],
		invoices: [],
		customer_licenses: [],
		meteredFeatures: ["messages"],
		customerEntitlementIdsByFeatureId: { messages: [customerEntitlement.id] },
	};
	const balance = {
		...customerEntitlement,
		balance: 72,
		additional_balance: 0,
		feature_id: "messages",
		customerPrice: null,
		customerProductOptions: null,
		customerProductQuantity: 1,
		isEntityLevel: false,
	};
	const data = {
		raw: JSON.stringify(cached) as string | null,
		epoch: "1",
		balance: JSON.stringify(balance) as string | null,
		changeAfterBalance: false,
	};
	const commands: string[] = [];
	const redis = {
		status: "ready",
		options: {},
		multi: () => {
			const reads: (() => unknown)[] = [];
			const transaction = {
				get: (key: string) => {
					commands.push("get");
					reads.push(() =>
						key.endsWith("view_epoch") ? data.epoch : data.raw,
					);
					return transaction;
				},
				hmget: () => {
					commands.push("hmget");
					reads.push(() => [data.balance]);
					return transaction;
				},
				exec: async () => {
					const result = reads.map((read) => [null, read()]);
					if (data.changeAfterBalance && commands.includes("hmget"))
						data.epoch = "2";
					return result;
				},
			};
			return transaction;
		},
	};
	ctx.redisV2 = redis as unknown as Redis;
	return { ...fixture, cached, data, commands };
}

test.concurrent(
	"baseline reads live hashes on the primary without resets, writes or a database fallback",
	async () => {
		const { ctx, data, commands } = setup();
		const subject = await readBalanceShadowSubject({
			ctx,
			customerId: "cus_test",
		});
		expect(subject.customerId).toBe("cus_test");
		expect(subject.subjectViewEpoch).toBe(1);
		expect(subject.customer_products[0].customer_entitlements[0].balance).toBe(
			72,
		);
		expect(commands).toEqual(["get", "get", "hmget", "get", "get"]);
		data.balance = null;
		await expect(
			readBalanceShadowSubject({ ctx, customerId: "cus_test" }),
		).rejects.toThrow("Redis balance is missing");
	},
);

test.concurrent(
	"missing, invalid or stale metadata refuses without invalidating any keys",
	async () => {
		const { ctx, cached, data } = setup();
		for (const raw of [
			null,
			"broken",
			JSON.stringify({ ...cached, _schemaVersion: 0 }),
			JSON.stringify({ ...cached, subjectViewEpoch: 0 }),
			JSON.stringify({ ...cached, usageWindowFeatureIds: ["messages"] }),
		]) {
			data.raw = raw;
			await expect(
				readBalanceShadowSubject({ ctx, customerId: "cus_test" }),
			).rejects.toThrow();
		}
	},
);

test.concurrent(
	"an epoch change while reading balances invalidates the baseline",
	async () => {
		const { ctx, data } = setup();
		data.changeAfterBalance = true;
		await expect(
			readBalanceShadowSubject({ ctx, customerId: "cus_test" }),
		).rejects.toThrow("Redis subject changed while reading balances");
	},
);
