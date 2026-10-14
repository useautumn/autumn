import {
	getRevenuecatAccessToken,
	getRevenuecatProjectId,
} from "@/external/revenueCat/misc/getRevenuecatAccessToken.js";
import { initRevenuecatCli } from "@/external/revenueCat/misc/initRevenuecatCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

type RevenueCatCli = ReturnType<typeof initRevenuecatCli>;

export type RevenueCatCliHandle = {
	cli: RevenueCatCli;
	isMock: boolean;
};

const listEnvelope = ({
	items,
	nextPage,
	url,
}: {
	items: unknown[];
	nextPage: string | null;
	url: string;
}) =>
	new Response(
		JSON.stringify({ object: "list", items, next_page: nextPage, url }),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);

const buildMockFetchImpl = (fixtures: {
	subscriptions?: unknown[];
	purchases?: unknown[];
	products?: unknown[];
}): typeof fetch => {
	const serveList = (all: unknown[], path: string, page: string | null) => {
		if (all.length > 1 && page !== "2") {
			return listEnvelope({
				items: all.slice(0, 1),
				nextPage: `${path}?limit=100&mock_page=2`,
				url: path,
			});
		}
		const items = page === "2" ? all.slice(1) : all;
		return listEnvelope({ items, nextPage: null, url: path });
	};

	return (async (input: RequestInfo | URL) => {
		const url = new URL(input.toString());
		const path = url.pathname;
		const page = url.searchParams.get("mock_page");

		if (path.endsWith("/subscriptions")) {
			return serveList(fixtures.subscriptions ?? [], path, page);
		}
		if (path.endsWith("/purchases")) {
			return serveList(fixtures.purchases ?? [], path, page);
		}
		if (path.endsWith("/products")) {
			return serveList(fixtures.products ?? [], path, page);
		}

		return new Response(
			JSON.stringify({ error: "revenuecat_mock_route_not_implemented", path }),
			{ status: 404, headers: { "Content-Type": "application/json" } },
		);
	}) as typeof fetch;
};

export const getRevenueCatCli = async (
	ctx: AutumnContext,
): Promise<RevenueCatCliHandle | null> => {
	if (ctx.testOptions?.mockRevenueCat) {
		return {
			cli: initRevenuecatCli({
				projectId: "mock_project",
				accessToken: "mock_access_token",
				fetchImpl: buildMockFetchImpl(ctx.testOptions.revenueCat ?? {}),
			}),
			isMock: true,
		};
	}

	if (process.env.NODE_ENV !== "production") return null;

	const { db, org, env } = ctx;
	const accessToken = await getRevenuecatAccessToken({ db, org, env });
	if (!accessToken) return null;

	const revenueCatConfig = org.processor_configs?.revenuecat;
	const projectId = revenueCatConfig
		? getRevenuecatProjectId({ revenueCatConfig, env })
		: undefined;

	return {
		cli: initRevenuecatCli({ projectId, accessToken }),
		isMock: false,
	};
};
