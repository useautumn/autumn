import { render } from "ink";
import { AppEnv } from "../../lib/env/detect.js";
import { QueryProvider } from "../../views/react/components/providers/QueryProvider.js";
import { CustomersView } from "../../views/react/customers/CustomersView.js";
import { headlessCustomersCommand } from "./headless.js";

export interface CustomersCommandOptions {
	prod?: boolean;
	headless?: boolean;
	page?: number;
	search?: string;
	id?: string;
	limit?: number;
	format?: "text" | "json" | "csv";
}

export async function customersCommand(
	options: CustomersCommandOptions = {},
): Promise<void> {
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

	const instance = render(
		<QueryProvider>
			<CustomersView
				environment={environment}
				onExit={() => {
					instance.clear();
					instance.unmount();
					process.exit(0);
				}}
			/>
		</QueryProvider>,
	);

	process.on("SIGINT", () => {
		instance.clear();
		instance.unmount();
		process.exit(0);
	});
}

export default customersCommand;
