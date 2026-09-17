import { render } from "ink";
import { AppEnv } from "../../lib/env/detect.js";
import { QueryProvider } from "../../views/react/components/providers/QueryProvider.js";
import { FeaturesView } from "../../views/react/features/FeaturesView.js";
import { headlessFeaturesCommand } from "./headless.js";

export interface FeaturesCommandOptions {
	prod?: boolean;
	/** Run in headless mode (output for AI/programmatic use) */
	headless?: boolean;
	/** Page number */
	page?: number;
	/** Search query */
	search?: string;
	/** Get specific feature by ID */
	id?: string;
	/** Items per page */
	limit?: number;
	/** Output format: text, json, csv */
	format?: "text" | "json" | "csv";
	/** Include archived features */
	includeArchived?: boolean;
}

/**
 * Features command entry point
 * Renders the interactive features view or runs in headless mode
 */
export async function featuresCommand(
	options: FeaturesCommandOptions = {},
): Promise<void> {
	// Headless mode - structured output for AI/programmatic use
	// Auto-enable if not in a TTY
	if (options.headless || !process.stdout.isTTY) {
		await headlessFeaturesCommand({
			prod: options.prod,
			page: options.page,
			search: options.search,
			id: options.id,
			limit: options.limit,
			format: options.format,
			includeArchived: options.includeArchived,
		});
		return;
	}

	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;

	// Interactive mode - render Ink UI
	const instance = render(
		<QueryProvider>
			<FeaturesView
				environment={environment}
				onExit={() => {
					// Clear the terminal output for a clean exit
					instance.clear();
					instance.unmount();
					process.exit(0);
				}}
			/>
		</QueryProvider>,
	);

	// Handle Ctrl+C - clear terminal before exit
	process.on("SIGINT", () => {
		instance.clear();
		instance.unmount();
		process.exit(0);
	});
}

export default featuresCommand;
