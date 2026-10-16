import { expect, mock, test } from "bun:test";
import type { AgentPricingConfig, Feature } from "@autumn/shared";
import axios from "axios";

const messages = { id: "messages", name: "Messages" } as Feature;
const aiReplies = { id: "ai_replies", name: "AI replies" } as Feature;
let serverFeatures = [messages];

const client = axios.create({
	adapter: async (request) => {
		const responses: Record<string, unknown> = {
			"/products/features": { features: serverFeatures },
			"/products/products": { products: [], groupToDefaults: {} },
			"/products/product_counts": {},
			"/v1/configs/push": {},
		};
		return {
			data: responses[request.url ?? ""],
			status: 200,
			statusText: "OK",
			headers: {},
			config: request,
		};
	},
});

mock.module("@/services/useAxiosInstance", () => ({
	useAxiosInstance: () => client,
}));
mock.module("@/hooks/common/useActiveOrgId", () => ({
	useActiveOrgId: () => ({ activeOrgId: "org_123", sessionPending: false }),
}));
const sandbox = await import("@/hooks/sandbox/useActiveSandbox");
mock.module("@/hooks/sandbox/useActiveSandbox", () => ({
	...sandbox,
	useActiveSandbox: () => null,
}));
mock.module("@/hooks/common/useOrg", () => ({
	useOrg: () => ({
		org: { onboarded: true, default_currency: "usd" },
		mutate: async () => {},
	}),
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { MemoryRouter } = await import("react-router");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { useQueryKeyFactory } = await import(
	"@/hooks/common/useQueryKeyFactory"
);
const { usePricingConfigSave } = await import(
	"@/views/products/products/hooks/usePricingConfigSave"
);

const config: AgentPricingConfig = {
	features: [{ id: "ai_replies", type: "single_use" }],
	products: [
		{
			id: "ai_replies_plan",
			name: "AI replies",
			items: [
				{ feature_id: "ai_replies", price: 0.1, usage_model: "pay_per_use" },
			],
		},
	],
};

test("saving a pricing config that creates a feature refreshes the features list", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: 60_000, retry: false } },
	});
	let buildKey: (key: readonly unknown[]) => unknown[] = (key) => [...key];
	let save: ReturnType<typeof usePricingConfigSave> | undefined;

	const Probe = () => {
		buildKey = useQueryKeyFactory();
		save = usePricingConfigSave({ initialConfig: null });
		return null;
	};
	const render = () =>
		renderToStaticMarkup(
			<QueryClientProvider client={queryClient}>
				<MemoryRouter>
					<Probe />
				</MemoryRouter>
			</QueryClientProvider>,
		);

	render();
	queryClient.setQueryData(buildKey(["features"]), { features: [messages] });
	queryClient.setQueryData(buildKey(["product_counts"]), {});
	render();

	serverFeatures = [messages, aiReplies];
	const originalWindow = globalThis.window;
	globalThis.window = {
		location: { pathname: "/products", search: "" },
	} as Window & typeof globalThis;
	await save?.handleSave({ config });
	globalThis.window = originalWindow;

	const cached = queryClient.getQueryData<{ features: Feature[] }>(
		buildKey(["features"]),
	);
	expect(cached?.features.map((feature) => feature.id)).toContain("ai_replies");
});
