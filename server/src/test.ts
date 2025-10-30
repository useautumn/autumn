import "dotenv/config";
import { AutumnInt } from "./external/autumn/autumnCli.js";

const main = async () => {
	const autumn = new AutumnInt({ secretKey: process.env.JDEV! });

	const concurrency = 1;
	const promises = [];
	for (let i = 0; i < concurrency; i++) {
		const simulateTrack = async () => {
			const start = Date.now();
			const response = await autumn.track({
				customer_id: "john",
				feature_id: "credits",
				value: 350,
				entity_id: "entity_2",
			});
			console.log(response);
			const end = Date.now();
			console.log(`Track ${i} took ${end - start}ms`);
			return {
				latency: end - start,
			};
		};
		promises.push(simulateTrack());
	}
	const results = await Promise.all(promises);

	const latencies = results.map((r) => r.latency);
	const p99Latency = latencies.sort((a, b) => a - b)[
		Math.floor(latencies.length * 0.99)
	];
	console.log(`P99 latency: ${p99Latency}ms`);
};

main()
	.catch(console.error)
	.then(() => process.exit(0));
