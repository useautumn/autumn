import chalk from "chalk";
// @ts-expect-error - ervy doesn't have types
import ervy from "ervy";
import { fetchEvents } from "../../lib/api/endpoints/events.js";
import { AppEnv } from "../../lib/env/detect.js";
import { getKey } from "../../lib/env/keys.js";

const { bar, bg } = ervy;

interface AggregateOptions {
	prod: boolean;
	limit: number;
}

/**
 * Headless test command to inspect aggregate data and test ervy charts
 */
export async function eventsAggregateTestCommand(options: AggregateOptions) {
	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;
	const secretKey = getKey(environment);

	console.log(chalk.cyan(`\n=== Events Aggregate Test ===`));
	console.log(chalk.gray(`Environment: ${environment}`));
	console.log(chalk.gray(`Limit: ${options.limit}`));

	// Fetch events
	console.log(chalk.yellow(`\nFetching events...`));
	const response = await fetchEvents({
		secretKey,
		limit: options.limit,
	});

	const events = response.list;
	console.log(chalk.green(`Fetched ${events.length} events`));

	// === RAW DATA ===
	console.log(chalk.cyan(`\n=== Raw Events Sample (first 5) ===`));
	for (const event of events.slice(0, 5)) {
		console.log(
			JSON.stringify(
				{
					id: event.id.slice(0, 12) + "...",
					feature_id: event.feature_id,
					customer_id: event.customer_id.slice(0, 12) + "...",
					value: event.value,
					timestamp: new Date(event.timestamp).toISOString(),
				},
				null,
				2,
			),
		);
	}

	// === AGGREGATE BY FEATURE ===
	console.log(chalk.cyan(`\n=== Aggregate by Feature ===`));
	const featureMap = new Map<string, { count: number; totalValue: number }>();
	for (const event of events) {
		const existing = featureMap.get(event.feature_id) ?? {
			count: 0,
			totalValue: 0,
		};
		featureMap.set(event.feature_id, {
			count: existing.count + 1,
			totalValue: existing.totalValue + event.value,
		});
	}

	const byFeature = Array.from(featureMap.entries())
		.map(([featureId, data]) => ({
			featureId,
			count: data.count,
			totalValue: data.totalValue,
		}))
		.sort((a, b) => b.count - a.count);

	console.log(chalk.gray("Feature aggregates:"));
	for (const f of byFeature) {
		console.log(
			`  ${f.featureId.padEnd(30)} count=${f.count} total=${f.totalValue}`,
		);
	}

	// === AGGREGATE BY TIME (day) ===
	console.log(chalk.cyan(`\n=== Aggregate by Day ===`));
	const dayMap = new Map<string, number>();
	for (const event of events) {
		const date = new Date(event.timestamp);
		const dayKey = `${date.getMonth() + 1}/${date.getDate()}`;
		dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + 1);
	}

	const byDay = Array.from(dayMap.entries())
		.map(([day, count]) => ({ day, count }))
		.sort((a, b) => a.day.localeCompare(b.day));

	console.log(chalk.gray("Daily counts:"));
	for (const d of byDay) {
		console.log(`  ${d.day.padEnd(10)} count=${d.count}`);
	}

	// === ERVY BAR CHART DATA FORMAT ===
	console.log(chalk.cyan(`\n=== ervy Bar Chart Data Format ===`));

	// Prepare data for ervy - CORRECT format with bg() function
	const colors = ["cyan", "green", "yellow", "magenta", "blue", "red", "white"];
	const chartData = byFeature.slice(0, 6).map((f, idx) => ({
		key: f.featureId.length > 10 ? f.featureId.slice(0, 8) + ".." : f.featureId,
		value: f.count,
		style: bg(colors[idx % colors.length], 1),
	}));

	console.log(chalk.gray("Chart data:"));
	console.log(JSON.stringify(chartData, null, 2));

	// === RENDER ERVY BAR CHART ===
	console.log(chalk.cyan(`\n=== ervy Bar Chart Output ===`));
	try {
		const chartOutput = bar(chartData, {
			barWidth: 3,
			height: 6,
			padding: 2,
		});
		console.log(chartOutput);
	} catch (err) {
		console.log(chalk.red(`Bar chart error: ${err}`));
	}

	// === SIMPLE ASCII BAR (fallback) ===
	console.log(chalk.cyan(`\n=== Simple ASCII Bar Chart ===`));
	const maxCount = Math.max(...byFeature.map((f) => f.count));
	const barWidth = 40;

	for (const f of byFeature.slice(0, 8)) {
		const width = Math.round((f.count / maxCount) * barWidth);
		const barStr = "█".repeat(width);
		const label = f.featureId.length > 20 ? f.featureId.slice(0, 18) + ".." : f.featureId.padEnd(20);
		console.log(`${label} ${chalk.cyan(barStr)} ${f.count}`);
	}

	// === SUMMARY ===
	console.log(chalk.cyan(`\n=== Summary ===`));
	console.log(`Total events: ${events.length}`);
	console.log(`Total value: ${events.reduce((sum, e) => sum + e.value, 0)}`);
	console.log(`Unique features: ${featureMap.size}`);
	console.log(
		`Unique customers: ${new Set(events.map((e) => e.customer_id)).size}`,
	);

	console.log(chalk.green(`\n=== Done ===\n`));
}
