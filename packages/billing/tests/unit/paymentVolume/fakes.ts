import type { AxiomClient } from "@autumn/axiom";
import { createFxClient, type FxClient } from "@autumn/fx";
import type { SQL } from "drizzle-orm";
import type { TrackItem } from "../../../src/actions/pushHourlyMeters/types/trackItem";
import type { AutumnClient } from "../../../src/types/autumnClient";
import type { PostgresDb } from "../../../src/types/postgresDb";

export const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

export const fakeDb = ({
	rows,
	queries,
}: {
	rows: Record<string, unknown>[];
	queries: SQL[];
}): PostgresDb => ({
	execute: async (query) => {
		queries.push(query);
		return rows;
	},
});

/** Serves one USD table per day; records which days were asked for. */
export const fakeFx = ({
	ratesByDate,
	fetchedDates,
}: {
	ratesByDate: Record<string, Record<string, number>>;
	fetchedDates: string[];
}): FxClient =>
	createFxClient({
		config: {
			appId: "test",
			baseUrl: "https://rates.test",
			fetch: (async (input: URL | Request | string) => {
				const date = new URL(String(input)).pathname.match(
					/(\d{4}-\d{2}-\d{2})\.json$/,
				)?.[1];
				fetchedDates.push(date ?? "?");
				const rates = date ? ratesByDate[date] : undefined;
				if (!rates) {
					return new Response(
						JSON.stringify({
							error: true,
							status: 400,
							message: "not_available",
						}),
						{ status: 400 },
					);
				}
				const timestamp = Date.parse(`${date}T23:59:59Z`) / 1000;
				return new Response(JSON.stringify({ base: "USD", timestamp, rates }), {
					status: 200,
				});
			}) as typeof fetch,
		},
	});

export const fakeAutumn = ({
	batches,
	created,
}: {
	batches: TrackItem[][];
	created: { id: string; name: string }[];
}): AutumnClient => ({
	batchTrack: async ({ items }) => {
		batches.push(items);
		return { accepted: items.length };
	},
	getOrCreateCustomer: async (org) => {
		created.push(org);
	},
});

export const emptyAxiom = (): AxiomClient =>
	({
		api: {
			query: async () => ({ tables: [] }),
		},
	}) as unknown as AxiomClient;

export const paidRow = (
	overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
	id: "inv_1",
	stripe_id: "in_1",
	processor_type: "stripe",
	currency: "usd",
	paid_at: Date.parse("2026-09-27T11:20:00Z"),
	amount: 375,
	org_id: "org_a",
	org_slug: "acme",
	...overrides,
});
