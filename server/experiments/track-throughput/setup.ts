export {};

if (!process.env.TESTS_ORG || !process.env.UNIT_TEST_AUTUMN_SECRET_KEY) {
	throw new Error("TESTS_ORG and UNIT_TEST_AUTUMN_SECRET_KEY are required");
}

process.env.AUTUMN_TEST_BASE_URL ??= "http://127.0.0.1:8090";

const { ApiVersion } = await import("@autumn/shared");
const { TestFeature } = await import("@tests/setup/v2Features.js");
const { items } = await import("@tests/utils/fixtures/items.js");
const { products } = await import("@tests/utils/fixtures/products.js");
const { AutumnInt } = await import("@/external/autumn/autumnCli.js");

const runId = Date.now();
const customerId =
	process.env.TRACK_BENCH_CUSTOMER_ID ?? `track-bench-${runId}`;
const productGroup = `track-throughput-${runId}`;
const product = products.base({
	id: `track-bench-${runId}`,
	isDefault: true,
	group: productGroup,
	items: [
		items.monthlyMessages({
			includedUsage: 1_000_000_000_000,
		}),
	],
});

const autumn = new AutumnInt({
	secretKey: process.env.UNIT_TEST_AUTUMN_SECRET_KEY,
	baseUrl: `${process.env.AUTUMN_TEST_BASE_URL}/v1`,
	version: ApiVersion.V1_2,
});
await autumn.products.create(product);
await autumn.customers.create({
	id: customerId,
	name: "Track throughput benchmark",
	email: `${customerId}@example.com`,
	skipWebhooks: true,
	internalOptions: {
		default_group: productGroup,
	},
});

console.log(
	JSON.stringify({
		customerId,
		featureId: TestFeature.Messages,
	}),
);
process.exit(0);
