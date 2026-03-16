import { render } from "ink";
import { AppEnv } from "../../lib/env/detect.js";
import { QueryProvider } from "../../views/react/components/providers/QueryProvider.js";
import { CustomersView } from "../../views/react/customers/CustomersView.js";
import { headlessCustomersCommand } from "./headless.js";

export interface CustomersCommandOptions {
	prod?: boolean;
	/** Run in headless mode (output for AI/programmatic use) */
	headless?: boolean;
	/** Page number */
	page?: number;
	/** Search query */
	search?: string;
	/** Get specific customer by ID */
	id?: string;
	/** Items per page */
	limit?: number;
	/** Output format: text, json, csv */
	format?: "text" | "json" | "csv";
}

/**
 * Customers command entry point
 * Renders the interactive customers view or runs in headless mode
 */
export async function customersCommand(
	options: CustomersCommandOptions = {},
): Promise<void> {
	// Headless mode - structured output for AI/programmatic use
	// Auto-enable if not in a TTY
	if (options.headless || !process.stdout.isTTY) {
		await headlessCustomersCommand({
			prod: options.prod,
			page: options.page,
			search: options.search,
			id: options.id,
			limit: options.limit,
			format: options.format,
		});
		return;
	}

	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;

	// Interactive mode - render Ink UI
	const instance = render(
		<QueryProvider>
			<CustomersView
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

export default customersCommand;
