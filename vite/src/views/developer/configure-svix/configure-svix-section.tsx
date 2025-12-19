import "svix-react/style.css";
import { AppPortal, useEndpoints } from "svix-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import DataFlowDiagram, {
	type JsonField,
} from "@/components/v2/cards/DataFlowCard";
import { useTheme } from "@/contexts/ThemeProvider";

const myJson: JsonField[] = [
	{ label: "type", value: "customer.products.updated", type: "string" },
	{ label: "product_id", value: "prod_123", type: "success" },
	{ label: "status", value: "active", type: "info" },
	{ label: "customer_id", value: "cus_123", type: "string" },
	{ label: "entity_id", value: "ent_123", type: "string" },
];

export const ConfigureWebhookSection = ({
	dashboardUrl,
	publicToken,
}: {
	dashboardUrl: string;
	publicToken: string;
}) => {
	const { isDark } = useTheme();

	const endpoints = useEndpoints();
	console.log(endpoints);

	return (
		<div className="h-full px-20">
			<Card className="shadow-none bg-interactive-secondary">
				<CardHeader>
					<CardTitle>Autumn Webhooks</CardTitle>
					<CardDescription>
						Configure your Autumn webhook settings and view event logs.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{endpoints?.data?.length && endpoints.data.length < 0 && (
						<div className="flex items-center justify-center">
							<DataFlowDiagram
								sourceImage="/autumn-logo.png"
								jsonFields={myJson}
							/>
						</div>
					)}
					{/* {endpoints.data?.map((endpoint) => (
                            <div key={endpoint.id}>
                                {JSON.stringify(endpoint)}
                            </div>
                        ))} */}

					<AppPortal
						url={dashboardUrl}
						darkMode={isDark}
						style={{
							height: "400px",
							borderRadius: "8px",
							overflow: "clip",
						}}
					/>
				</CardContent>
			</Card>
		</div>
	);
};
