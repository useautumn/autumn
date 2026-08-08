export {};

type Result = {
	transport: "http" | "websocket";
	concurrency: number;
	requests: number;
	errors: number;
	rps: number;
	p50Ms: number;
	p95Ms: number;
	p99Ms: number;
};

const httpUrl =
	process.env.TRACK_HTTP_URL ?? "http://127.0.0.1:8090/v1/balances.track";
const wsUrl = process.env.TRACK_WS_URL ?? "ws://127.0.0.1:8091";
const secretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
const customerId = process.env.TRACK_BENCH_CUSTOMER_ID;
const featureId = process.env.TRACK_BENCH_FEATURE_ID ?? "messages";
const durationMs = Number(process.env.TRACK_BENCH_DURATION_MS ?? 5_000);
const concurrencies = (process.env.TRACK_BENCH_CONCURRENCIES ?? "1,8,32,128,512")
	.split(",")
	.map(Number);
const transports = (
	process.env.TRACK_BENCH_TRANSPORTS ?? "http,websocket"
).split(",");

if (!secretKey || !customerId) {
	throw new Error(
		"UNIT_TEST_AUTUMN_SECRET_KEY and TRACK_BENCH_CUSTOMER_ID are required",
	);
}

const percentile = (sorted: number[], p: number) =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

const summarize = ({
	transport,
	concurrency,
	startedAt,
	latencies,
	errors,
}: {
	transport: Result["transport"];
	concurrency: number;
	startedAt: number;
	latencies: number[];
	errors: number;
}): Result => {
	const elapsedSeconds = (performance.now() - startedAt) / 1_000;
	latencies.sort((a, b) => a - b);
	return {
		transport,
		concurrency,
		requests: latencies.length,
		errors,
		rps: latencies.length / elapsedSeconds,
		p50Ms: percentile(latencies, 0.5),
		p95Ms: percentile(latencies, 0.95),
		p99Ms: percentile(latencies, 0.99),
	};
};

const runHttp = async (concurrency: number): Promise<Result> => {
	const deadline = performance.now() + durationMs;
	const latencies: number[] = [];
	let errors = 0;

	const worker = async () => {
		while (performance.now() < deadline) {
			const startedAt = performance.now();
			try {
				const response = await fetch(httpUrl, {
					method: "POST",
					headers: {
						authorization: `Bearer ${secretKey}`,
						"content-type": "application/json",
						"x-api-version": "2.1",
					},
					body: JSON.stringify({
						customer_id: customerId,
						feature_id: featureId,
						value: 1,
						skip_event: true,
					}),
				});
				const responseBody = await response.json();
				if (
					response.status !== 200 ||
					typeof responseBody.balance?.remaining !== "number"
				) {
					throw new Error(
						`${response.status}: ${JSON.stringify(responseBody).slice(0, 200)}`,
					);
				}
				latencies.push(performance.now() - startedAt);
			} catch (error) {
				errors++;
				if (errors === 1) console.error("first HTTP error", error);
			}
		}
	};

	const startedAt = performance.now();
	await Promise.all(Array.from({ length: concurrency }, worker));
	return summarize({
		transport: "http",
		concurrency,
		startedAt,
		latencies,
		errors,
	});
};

const runWebSocket = async (concurrency: number): Promise<Result> => {
	const ws = new WebSocket(wsUrl);
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", () => reject(new Error("WebSocket failed")), {
			once: true,
		});
	});

	const deadline = performance.now() + durationMs;
	const latencies: number[] = [];
	const pending = new Map<number, number>();
	let errors = 0;
	let nextRequestId = 1;
	let finished = false;

	const send = () => {
		if (performance.now() >= deadline) return;
		const requestId = nextRequestId++;
		pending.set(requestId, performance.now());
		ws.send(
			JSON.stringify([
				1,
				requestId,
				customerId,
				featureId,
				1,
			]),
		);
	};

	const completed = new Promise<void>((resolve) => {
		ws.addEventListener("message", (event) => {
			const frame = JSON.parse(String(event.data));
			const requestId = frame[1] as number;
			const startedAt = pending.get(requestId);
			pending.delete(requestId);

			if (
				frame[0] === 2 &&
				startedAt !== undefined &&
				typeof frame[2] === "number" &&
				typeof frame[3] === "number"
			) {
				latencies.push(performance.now() - startedAt);
			} else {
				errors++;
				if (errors === 1) console.error("first WebSocket error", frame);
			}

			if (performance.now() < deadline) {
				send();
			} else if (pending.size === 0 && !finished) {
				finished = true;
				resolve();
			}
		});
	});

	const startedAt = performance.now();
	for (let i = 0; i < concurrency; i++) send();
	await completed;
	ws.close();

	return summarize({
		transport: "websocket",
		concurrency,
		startedAt,
		latencies,
		errors,
	});
};

console.log(
	`duration=${durationMs}ms/arm customer=${customerId} feature=${featureId}`,
);
console.log(
	"transport  conc    requests       rps    p50ms    p95ms    p99ms  errors",
);
console.log("-".repeat(78));

const results: Result[] = [];
for (const concurrency of concurrencies) {
	for (const run of [
		...(transports.includes("http") ? [runHttp] : []),
		...(transports.includes("websocket") ? [runWebSocket] : []),
	]) {
		const result = await run(concurrency);
		results.push(result);
		console.log(
			`${result.transport.padEnd(10)} ${String(concurrency).padStart(4)} ` +
				`${String(result.requests).padStart(11)} ${result.rps.toFixed(0).padStart(9)} ` +
				`${result.p50Ms.toFixed(2).padStart(8)} ${result.p95Ms.toFixed(2).padStart(8)} ` +
				`${result.p99Ms.toFixed(2).padStart(8)} ${String(result.errors).padStart(7)}`,
		);
	}
}

console.log(`RESULTS_JSON=${JSON.stringify(results)}`);
