import { render } from "ink";
import { AppEnv } from "../../lib/env/detect.js";
import { QueryProvider } from "../../views/react/components/providers/QueryProvider.js";
import { ProductsView } from "../../views/react/products/ProductsView.js";
import { headlessProductsCommand } from "./headless.js";

export interface ProductsCommandOptions {
	prod?: boolean;
	headless?: boolean;
	page?: number;
	search?: string;
	id?: string;
	limit?: number;
	format?: "text" | "json" | "csv";
	includeArchived?: boolean;
}

export async function productsCommand(
	options: ProductsCommandOptions = {},
): Promise<void> {
	if (options.headless || !process.stdout.isTTY) {
		await headlessProductsCommand({
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

	const instance = render(
		<QueryProvider>
			<ProductsView
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

export default productsCommand;
