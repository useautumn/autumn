import { render } from "ink";
import { headlessEventsCommand } from "./headless.js";

export interface EventsCommandOptions {
	prod?: boolean;
	/** Run in headless mode (output for AI/programmatic use) */
	headless?: boolean;
	/** Page number */
	page?: number;
	/** Items per page */
	limit?: number;
	/** Output format: text, json, csv */
	format?: "text" | "json" | "csv";
	/** Filter by customer ID */
	customerId?: string;
	/** Filter by feature ID (can be comma-separated for multiple) */
	featureId?: string;
	/** Time range: 24h, 7d, 30d, 90d */
	timeRange?: "24h" | "7d" | "30d" | "90d";
	/** View mode: list or aggregate */
	mode?: "list" | "aggregate";
	/** Bin size for aggregate: hour, day, month */
	binSize?: "hour" | "day" | "month";
	/** Group by property (for aggregate mode) */
	groupBy?: string;
}

/**
 * Events command entry point
 */
export async function eventsCommand(
	options: EventsCommandOptions = {},
): Promise<void> {
	// Use headless mode if explicitly requested or if not in a TTY
	const useHeadless = options.headless || !process.stdout.isTTY;

	if (useHeadless) {
		await headlessEventsCommand({
			prod: options.prod,
			page: options.page,
			limit: options.limit,
			format: options.format,
			customerId: options.customerId,
			featureId: options.featureId,
			timeRange: options.timeRange,
			mode: options.mode,
			binSize: options.binSize,
			groupBy: options.groupBy,
		});
		return;
	}

	// Interactive mode - render the EventsView
	const { QueryProvider } = await import(
		"../../views/react/components/providers/QueryProvider.js"
	);
	const { EventsView } = await import("../../views/react/events/index.js");
	const { AppEnv } = await import("../../lib/env/index.js");

	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;

	const instance = render(
		<QueryProvider>
			<EventsView
				environment={environment}
				customerId={options.customerId}
				featureId={options.featureId}
			/>
		</QueryProvider>,
	);

	// Handle SIGINT for clean exit
	process.on("SIGINT", () => {
		instance.clear();
		process.exit(0);
	});

	await instance.waitUntilExit();
}

export default eventsCommand;
