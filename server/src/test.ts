import "dotenv/config";
import { AutumnInt } from "./external/autumn/autumnCli.js";

const main = async () => {
	const autumn = new AutumnInt({ secretKey: process.env.JDEV! });

	const concurrency = 1000;
	const promises = [];
	for (let i = 0; i < concurrency; i++) {
		const simulateTrack = async () => {
			const start = Date.now();
			await autumn.track({
				customer_id: "john",
				feature_id: "credits",
				value: 1,
			});

			const end = Date.now();
			console.log(`Track ${i} took ${end - start}ms`);
			return {
				latency: end - start,
			};
		};
		promises.push(simulateTrack());
	}
	const results = await Promise.allSettled(promises);

	const latencies = results
		.filter((r) => r.status === "fulfilled")
		.map((r) => r.value.latency);
	const p99Latency = latencies.sort((a, b) => a - b)[
		Math.floor(latencies.length * 0.99)
	];
	console.log(`P99 latency: ${p99Latency}ms`);

	const rejectedCount = results.filter((r) => r.status === "rejected").length;
	console.log(`Rejected count: ${rejectedCount}`);

	for (const result of results) {
		if (result.status === "rejected") {
			console.error((result.reason as any).message);
		}
	}
};

main()
	.catch(console.error)
	.then(() => process.exit(0));
