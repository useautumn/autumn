import { AutumnInt } from "../src/external/autumn/autumnCli";

export const test = async () => {
	const autumn = new AutumnInt({
		secretKey: "test",
	});

	const customerId = `batch_test_${Date.now()}`;

	// Send 100 track events concurrently
	console.log(`Sending 100 track events concurrently for customer: ${customerId}`);
	const startTime = Date.now();

	const promises = Array.from({ length: 100 }, (_, i) =>
		autumn.track({
			customer_id: customerId,
			feature_id: "token",
			value: 1,
		}).then(() => {
			console.log(`Event ${i + 1} completed`);
		}).catch((err) => {
			console.error(`Event ${i + 1} failed:`, err.message);
		})
	);

	await Promise.all(promises);

	const endTime = Date.now();
	console.log(`\nAll 100 events sent in ${endTime - startTime}ms`);
	console.log("Check server logs to verify batching behavior");
};

await test();
process.exit(0);
