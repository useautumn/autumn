import type {
	ListBalancesParamsInput,
	ListBalancesResponse,
	ListPurchasesParamsInput,
	ListPurchasesResponse,
	ListSubscriptionsParamsInput,
	ListSubscriptionsResponse,
} from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

type ListOptions = { scanCap?: number };

const capHeaders = ({ scanCap }: ListOptions) =>
	scanCap === undefined ? undefined : { "x-list-scan-cap": String(scanCap) };

export const listSubscriptions = ({
	autumn,
	params,
	options = {},
}: {
	autumn: AutumnInt;
	params: ListSubscriptionsParamsInput;
	options?: ListOptions;
}): Promise<ListSubscriptionsResponse> =>
	autumn.post("/subscriptions.list", params, capHeaders(options));

export const listPurchases = ({
	autumn,
	params,
}: {
	autumn: AutumnInt;
	params: ListPurchasesParamsInput;
}): Promise<ListPurchasesResponse> => autumn.post("/purchases.list", params);

export const listBalances = ({
	autumn,
	params,
	options = {},
}: {
	autumn: AutumnInt;
	params: ListBalancesParamsInput;
	options?: ListOptions;
}): Promise<ListBalancesResponse> =>
	autumn.post("/balances.list", params, capHeaders(options));

/** Follows next_cursor until has_more is false, returning every page. */
export const walkAllPages = async <
	TRow,
	TResponse extends {
		list: TRow[];
		has_more: boolean;
		next_cursor: string | null;
	},
>({
	fetchPage,
}: {
	fetchPage: (startCursor: string) => Promise<TResponse>;
}): Promise<TResponse[]> => {
	const pages: TResponse[] = [];
	let cursor = "";
	for (let i = 0; i < 50; i++) {
		const page = await fetchPage(cursor);
		pages.push(page);
		if (!page.has_more) return pages;
		if (!page.next_cursor) throw new Error("has_more without next_cursor");
		cursor = page.next_cursor;
	}
	throw new Error("walkAllPages: exceeded 50 pages");
};
