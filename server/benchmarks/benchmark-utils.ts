import chalk from "chalk";

export interface BenchmarkResult {
	name: string;
	iterations: number;
	totalTime: number;
	averageTime: number;
	minTime: number;
	maxTime: number;
	standardDeviation: number;
	operationsPerSecond: number;
}

export interface BenchmarkOptions {
	iterations?: number;
	warmupIterations?: number;
	dryRun?: boolean;
	verbose?: boolean;
}

export class BenchmarkRunner {
	private results: BenchmarkResult[] = [];

	constructor(private options: BenchmarkOptions = {}) {
		this.options = {
			iterations: 100,
			warmupIterations: 10,
			dryRun: true,
			verbose: false,
			...options,
		};
	}

	async run(
		name: string,
		operation: () => Promise<any> | any,
	): Promise<BenchmarkResult> {
		const { iterations = 100, warmupIterations = 10, verbose } = this.options;

		// Warmup phase (silent)
		for (let i = 0; i < warmupIterations; i++) {
			await operation();
		}

		// Actual benchmark with progress
		const times: number[] = [];
		const startTime = Date.now();

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			await operation();
			const end = performance.now();
			times.push(end - start);
		}

		const result = this.calculateStats(name, times, iterations);
		this.results.push(result);

		// Show immediate result with progress indicator
		const progress = `${this.results.length}`.padStart(2, " ");
		const avgColor =
			result.averageTime < 5
				? chalk.green
				: result.averageTime < 20
					? chalk.yellow
					: chalk.red;
		console.log(
			`${chalk.gray(`[${progress}]`)} ${chalk.cyan(name.padEnd(35))} ${avgColor(`${result.averageTime.toFixed(2)}ms`)}`,
		);

		return result;
	}

	private calculateStats(
		name: string,
		times: number[],
		iterations: number,
	): BenchmarkResult {
		const totalTime = times.reduce((sum, time) => sum + time, 0);
		const averageTime = totalTime / iterations;
		const minTime = Math.min(...times);
		const maxTime = Math.max(...times);

		// Calculate standard deviation
		const variance =
			times.reduce((sum, time) => sum + (time - averageTime) ** 2, 0) /
			iterations;
		const standardDeviation = Math.sqrt(variance);

		const operationsPerSecond = 1000 / averageTime;

		return {
			name,
			iterations,
			totalTime,
			averageTime,
			minTime,
			maxTime,
			standardDeviation,
			operationsPerSecond,
		};
	}

	private printResult(result: BenchmarkResult) {
		const { name, averageTime, minTime, maxTime, operationsPerSecond } = result;

		// Color code performance: green for fast, yellow for medium, red for slow
		const avgColor =
			averageTime < 5
				? chalk.green
				: averageTime < 20
					? chalk.yellow
					: chalk.red;
		const opsColor =
			operationsPerSecond > 200
				? chalk.green
				: operationsPerSecond > 50
					? chalk.yellow
					: chalk.red;

		console.log(chalk.cyan(`\n📊 ${name}`));
		console.log(
			`   ${avgColor(`⚡ ${averageTime.toFixed(2)}ms avg`)} | ${chalk.gray(`${minTime.toFixed(2)}-${maxTime.toFixed(2)}ms range`)} | ${opsColor(`${operationsPerSecond.toFixed(0)} ops/sec`)}`,
		);
	}

	printSummary() {
		if (this.results.length === 0) return;

		console.log(chalk.yellow("\n🏁 Performance Summary"));
		console.log(chalk.yellow("─".repeat(50)));

		// Sort results by average time for better readability
		const sortedResults = [...this.results].sort(
			(a, b) => a.averageTime - b.averageTime,
		);

		sortedResults.forEach((result, index) => {
			const medal =
				index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "  ";
			const { name, averageTime, operationsPerSecond } = result;
			const avgColor =
				averageTime < 5
					? chalk.green
					: averageTime < 20
						? chalk.yellow
						: chalk.red;

			console.log(
				`${medal} ${chalk.cyan(name.padEnd(30))} ${avgColor(`${averageTime.toFixed(2)}ms`)} ${chalk.gray(`(${operationsPerSecond.toFixed(0)} ops/sec)`)}`,
			);
		});

		// Performance insights
		const totalTests = this.results.length;
		const avgPerformance =
			this.results.reduce((sum, r) => sum + r.averageTime, 0) / totalTests;
		const fastTests = this.results.filter((r) => r.averageTime < 5).length;

		console.log(
			chalk.gray(
				`\n💡 ${fastTests}/${totalTests} operations under 5ms | Average: ${avgPerformance.toFixed(2)}ms`,
			),
		);
	}

	getResults(): BenchmarkResult[] {
		return [...this.results];
	}

	exportResults(filename?: string): string {
		const data = {
			timestamp: new Date().toISOString(),
			options: this.options,
			results: this.results,
		};

		const json = JSON.stringify(data, null, 2);

		if (filename) {
			// In a real implementation, you'd write to file here
			console.log(chalk.blue(`📄 Results would be exported to: ${filename}`));
		}

		return json;
	}
}

// Dry run helpers
export class DryRunHelper {
	private static mockDatabase = new Map();
	private static mockStripe = {
		customers: { create: () => ({ id: "cus_mock" }) },
		prices: { create: () => ({ id: "price_mock" }) },
		products: { create: () => ({ id: "prod_mock" }) },
	};

	static mockDbOperation<T>(operation: string, data?: any): T {
		// Simulate database latency
		const latency = Math.random() * 5; // 0-5ms
		const start = performance.now();
		while (performance.now() - start < latency) {
			// Busy wait to simulate actual work
		}

		// Store/retrieve mock data
		if (data) {
			DryRunHelper.mockDatabase.set(operation, data);
		}

		return DryRunHelper.mockDatabase.get(operation) || { id: "mock_id", ...data };
	}

	static mockStripeOperation<T>(operation: string, data?: any): T {
		// Simulate Stripe API latency (higher than DB)
		const latency = Math.random() * 50 + 10; // 10-60ms
		const start = performance.now();
		while (performance.now() - start < latency) {
			// Busy wait to simulate network call
		}

		return { id: `stripe_mock_${Date.now()}`, ...data } as T;
	}

	static mockComplexCalculation(iterations: number = 1000): number {
		// Simulate CPU-intensive calculation
		let result = 0;
		for (let i = 0; i < iterations; i++) {
			result += Math.sqrt(i) * Math.sin(i);
		}
		return result;
	}
}

// Utility to create mock data similar to test fixtures
export const createMockCustomer = (customerId: string) => ({
	id: customerId,
	internal_id: `internal_${customerId}`,
	email: `${customerId}@example.com`,
	created_at: new Date(),
	balance: 1000,
	entities: [],
});

export const createMockProduct = (productId: string) => ({
	id: productId,
	name: `Product ${productId}`,
	type: "subscription",
	prices: [],
	entitlements: [],
});

export const createMockEvent = (
	customerId: string,
	featureId: string,
	usage: number = 1,
) => ({
	customer_id: customerId,
	feature_id: featureId,
	usage,
	properties: {},
	timestamp: new Date(),
});
