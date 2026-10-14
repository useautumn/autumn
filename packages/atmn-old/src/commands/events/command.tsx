import { render } from "ink";
import { headlessEventsCommand } from "./headless.js";

export interface EventsCommandOptions {
	prod?: boolean;
	headless?: boolean;
	page?: number;
	limit?: number;
	format?: "text" | "json" | "csv";
	customerId?: string;
	featureId?: string;
	timeRange?: "24h" | "7d" | "30d" | "90d";
	mode?: "list" | "aggregate";
	binSize?: "hour" | "day" | "month";
	groupBy?: string;
}

export async function eventsCommand(
	options: EventsCommandOptions = {},
): Promise<void> {
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

	process.on("SIGINT", () => {
		instance.clear();
		process.exit(0);
	});

	await instance.waitUntilExit();
}

export default eventsCommand;
