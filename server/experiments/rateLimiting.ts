import AutumnError, { AutumnInt } from "../src/external/autumn/autumnCli";

export const main = async () => {
	console.log("🚀 Starting rate limit test...\n");

	// Initialize client
	const autumn = new AutumnInt();
	const numRequests = 200;

  const customerId1 = "test1";
  const customerId2 = "test2";

	console.log(`Testing with ${numRequests} concurrent requests to /track endpoint`);
	console.log(`Using base URL: ${autumn.baseUrl}\n`);

	// Create all track requests
	const cusId1Promises = [];
	const cusId2Promises = [];
	for (let i = 0; i < numRequests; i++) {
		cusId1Promises.push(
			autumn.customers.create({
				id: customerId1,
			}),
		);
		cusId2Promises.push(
			autumn.customers.create({
				id: customerId2,
			}),
		);
	}

	// Execute all requests concurrently for both customers
	const startTime = Date.now();
	const [cusId1Results, cusId2Results] = await Promise.all([
		Promise.allSettled(cusId1Promises),
		Promise.allSettled(cusId2Promises),
	]);
	const duration = Date.now() - startTime;

	// Helper function to analyze results
	const analyzeResults = (results: PromiseSettledResult<unknown>[]) => {
		const succeeded = results.filter((r) => r.status === "fulfilled").length;
		const rateLimited = results.filter(
			(r) =>
				r.status === "rejected" &&
				r.reason instanceof AutumnError &&
				r.reason.code === "rate_limit_exceeded",
		).length;
		const otherErrors = results.filter(
			(r) =>
				r.status === "rejected" &&
				!(
					r.reason instanceof AutumnError &&
					r.reason.code === "rate_limit_exceeded"
				),
		).length;
		return { succeeded, rateLimited, otherErrors };
	};

	const cus1Stats = analyzeResults(cusId1Results);
	const cus2Stats = analyzeResults(cusId2Results);
	const totalRequests = numRequests * 2;

	// Display results
	console.log("📊 Results:");
	console.log("═".repeat(60));
	console.log(`Total requests:       ${totalRequests} (${numRequests} per customer)`);
	console.log(`⏱️  Duration:           ${duration}ms`);
	console.log(`📈 Throughput:         ${Math.round(totalRequests / (duration / 1000))} req/s`);
	console.log("═".repeat(60));

	console.log(`\n👤 Customer 1 (${customerId1}):`);
	console.log("─".repeat(60));
	console.log(`  Total:              ${numRequests}`);
	console.log(`  ✅ Succeeded:        ${cus1Stats.succeeded}`);
	console.log(`  ⛔ Rate limited:     ${cus1Stats.rateLimited}`);
	console.log(`  ❌ Other errors:     ${cus1Stats.otherErrors}`);

	console.log(`\n👤 Customer 2 (${customerId2}):`);
	console.log("─".repeat(60));
	console.log(`  Total:              ${numRequests}`);
	console.log(`  ✅ Succeeded:        ${cus2Stats.succeeded}`);
	console.log(`  ⛔ Rate limited:     ${cus2Stats.rateLimited}`);
	console.log(`  ❌ Other errors:     ${cus2Stats.otherErrors}`);

	console.log("\n📈 Combined Stats:");
	console.log("─".repeat(60));
	console.log(
		`  ✅ Total succeeded:  ${cus1Stats.succeeded + cus2Stats.succeeded}`,
	);
	console.log(
		`  ⛔ Total rate limited: ${cus1Stats.rateLimited + cus2Stats.rateLimited}`,
	);
	console.log(
		`  ❌ Total errors:     ${cus1Stats.otherErrors + cus2Stats.otherErrors}`,
	);

	// Show sample errors if any
	const totalErrors = cus1Stats.otherErrors + cus2Stats.otherErrors;
	if (totalErrors > 0) {
		console.log("\n⚠️  Sample of other errors:");
		const errorSamples = [...cusId1Results, ...cusId2Results]
			.filter(
				(r) =>
					r.status === "rejected" &&
					!(
						r.reason instanceof AutumnError &&
						r.reason.code === "rate_limit_exceeded"
					),
			)
			.slice(0, 3);

		for (const sample of errorSamples) {
			if (sample.status === "rejected") {
				console.log(`  - ${sample.reason}`);
			}
		}
	}

	console.log("\n✨ Test complete!");
};

await main();