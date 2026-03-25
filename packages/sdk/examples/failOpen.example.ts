import { Autumn } from "../src/index.js";

const FAKE_URL =
	"https://totallynotarealdomaingeneratedbyclaudetomakethetestsworktofail.co";

async function testFailOpenCheck() {
	console.log("--- Test: check() fail-open (enabled by default) ---");
	const autumn = new Autumn({
		secretKey: "sk_fake",
		serverURL: FAKE_URL,
	});

	const result = await autumn.check({
		customerId: "cus_123",
		featureId: "messages",
	});

	console.log("Result:", JSON.stringify(result, null, 2));
	console.log(
		"allowed === true:",
		(result as { allowed: boolean }).allowed === true,
	);
	console.log();
}

async function testFailOpenTrack() {
	console.log("--- Test: track() fail-open (enabled by default) ---");
	const autumn = new Autumn({
		secretKey: "sk_fake",
		serverURL: FAKE_URL,
	});

	const result = await autumn.track({
		customerId: "cus_123",
		featureId: "messages",
		value: 1,
	});

	console.log("Result:", JSON.stringify(result, null, 2));
	console.log();
}

async function testFailOpenGetCustomer() {
	console.log(
		"--- Test: customers.getOrCreate() fail-open (enabled by default) ---",
	);
	const autumn = new Autumn({
		secretKey: "sk_fake",
		serverURL: FAKE_URL,
	});

	const result = await autumn.customers.getOrCreate({
		customerId: "cus_123",
	});

	console.log("Result:", JSON.stringify(result, null, 2));
	console.log("id === null:", result.id === null);
	console.log();
}

async function testFailOpenDisabled() {
	console.log("--- Test: check() with failOpen: false (should throw) ---");
	const autumn = new Autumn({
		secretKey: "sk_fake",
		serverURL: FAKE_URL,
		failOpen: false,
	});

	try {
		await autumn.check({
			customerId: "cus_123",
			featureId: "messages",
		});
		console.log("ERROR: Should have thrown but did not!");
	} catch (err) {
		console.log("Correctly threw error:", (err as Error).message);
	}
	console.log();
}

async function main() {
	await testFailOpenCheck();
	await testFailOpenTrack();
	await testFailOpenGetCustomer();
	await testFailOpenDisabled();
	console.log("All tests complete.");
}

main().catch(console.error);
