import { InternalError } from "@autumn/shared";
import qs from "qs";
import type { StripeReadClient } from "../../types/stripeReadClient.js";
import { capStripeResponse } from "./capStripeResponse.js";
import { redactStripeResponse } from "./redactStripeResponse.js";
import { validateStripeReadRequest } from "./validateStripeReadRequest.js";

export const MAX_STRIPE_READ_PAGES = 10;

type StripeParams = Record<string, unknown>;

type StripePage = {
	object?: string;
	data?: unknown[];
	has_more?: boolean;
	next_page?: string | null;
	next_page_url?: string | null;
};

type NextRequest = { path: string; params?: StripeParams } | undefined;

const withQuery = ({
	path,
	params,
}: {
	path: string;
	params?: StripeParams;
}) => {
	const query = qs.stringify(params ?? {}, {
		arrayFormat: path.startsWith("/v2/") ? "repeat" : "indices",
	});
	return query ? `${path}?${query}` : path;
};

const isPaginatedList = (page: StripePage) =>
	Array.isArray(page.data) &&
	(page.object === "list" ||
		page.object === "search_result" ||
		"next_page_url" in page);

const nextPageRequest = ({
	page,
	path,
	params,
}: {
	page: StripePage;
	path: string;
	params?: StripeParams;
}): NextRequest => {
	if (page.object === "list" && page.has_more) {
		const lastId = (page.data?.at(-1) as { id?: string } | undefined)?.id;
		return lastId
			? { path, params: { ...params, starting_after: lastId } }
			: undefined;
	}
	if (page.object === "search_result" && page.has_more && page.next_page) {
		return { path, params: { ...params, page: page.next_page } };
	}
	if (page.next_page_url) return { path: page.next_page_url };
	return undefined;
};

export const stripeGet = async ({
	client,
	path,
	params,
	maxPages = 1,
}: {
	client: StripeReadClient;
	path: string;
	params?: StripeParams;
	maxPages?: number;
}): Promise<unknown> => {
	if (client.platformKeyed && !client.stripeAccount) {
		throw new InternalError({
			message: "Refusing platform-keyed Stripe read without a Stripe account",
		});
	}

	const pageLimit = Math.min(Math.max(1, maxPages), MAX_STRIPE_READ_PAGES);
	const get = async (request: NonNullable<NextRequest>) => {
		const [requestPath] = request.path.split("?");
		validateStripeReadRequest({ path: requestPath, params: request.params });
		const requestUrl = request.params ? withQuery(request) : request.path;
		return (await client.stripe.rawRequest("GET", requestUrl, undefined, {
			stripeAccount: client.stripeAccount,
		})) as StripePage;
	};

	const first = await get({ path, params: params ?? {} });
	if (!isPaginatedList(first))
		return capStripeResponse({ body: redactStripeResponse({ body: first }) });

	const data = [...(first.data ?? [])];
	let next = nextPageRequest({ page: first, path, params });
	for (let pageCount = 1; next && pageCount < pageLimit; pageCount++) {
		const page = await get(next);
		data.push(...(page.data ?? []));
		next = nextPageRequest({ page, path, params });
	}

	const isSearch = first.object === "search_result";
	const searchCursor = isSearch ? next?.params?.page : undefined;
	return capStripeResponse({
		body: redactStripeResponse({
			body: {
				object: isSearch ? "search_result" : "list",
				data,
				has_more: Boolean(next),
				...(searchCursor ? { next_page: searchCursor } : {}),
			},
		}),
	});
};
