import { z } from "zod/v4";
import type { FxClient } from "./types/fxClient.js";
import { FX_SOURCE, type UsdRateTable } from "./types/usdRateTable.js";

const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_SECOND = 1000;

const ratesResponseSchema = z.object({
	base: z.literal("USD"),
	timestamp: z.number().int(),
	rates: z.record(z.string(), z.number()),
});

const providerErrorSchema = z.object({
	error: z.literal(true),
	status: z.number(),
	message: z.string(),
	description: z.string().optional(),
});

export class FxProviderError extends Error {
	readonly status: number;

	constructor({ status, detail }: { status: number; detail: string }) {
		super(`Rates provider returned ${status}: ${detail}`);
		this.name = "FxProviderError";
		this.status = status;
	}
}

const utcDateOf = (timestampSeconds: number): string =>
	new Date(timestampSeconds * MS_PER_SECOND).toISOString().slice(0, 10);

// Error text is built from the body only: the request URL carries the app id.
const providerErrorDetail = (body: unknown): string => {
	const parsed = providerErrorSchema.safeParse(body);
	return parsed.success
		? `${parsed.data.message}${parsed.data.description ? ` (${parsed.data.description})` : ""}`
		: "unexpected error body";
};

const fetchUsdRateTable = async ({
	ctx,
	date,
}: {
	ctx: { fx: FxClient };
	date: string;
}): Promise<UsdRateTable> => {
	const url = new URL(`${ctx.fx.baseUrl}/historical/${date}.json`);
	url.searchParams.set("app_id", ctx.fx.appId);
	url.searchParams.set("base", "USD");

	const response = await ctx.fx.fetch(url);
	const body: unknown = await response.json().catch(() => null);

	if (!response.ok) {
		throw new FxProviderError({
			status: response.status,
			detail: providerErrorDetail(body),
		});
	}

	const parsed = ratesResponseSchema.safeParse(body);
	if (!parsed.success) {
		throw new Error(
			`Unexpected rates response for ${date}: ${parsed.error.message}`,
		);
	}

	const publishedDate = utcDateOf(parsed.data.timestamp);
	if (publishedDate !== date) {
		throw new Error(
			`Asked for rates on ${date}, provider returned ${publishedDate}`,
		);
	}

	return { date, source: FX_SOURCE, rates: parsed.data.rates };
};

/** USD-base rates for one UTC day, fetched once per client. Throws unless the provider confirms that exact day. */
export const getUsdRateTable = async ({
	ctx,
	date,
}: {
	ctx: { fx: FxClient };
	date: string;
}): Promise<UsdRateTable> => {
	if (!UTC_DATE_PATTERN.test(date)) {
		throw new Error(`Rate date must be YYYY-MM-DD, got "${date}"`);
	}
	const cached = ctx.fx.rateTables.get(date);
	if (cached) return cached;

	const table = await fetchUsdRateTable({ ctx, date });
	ctx.fx.rateTables.set(date, table);
	return table;
};
