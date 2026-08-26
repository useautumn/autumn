import { expect, test } from "bun:test";
import type { EventsData } from "@/views/customers/customer/analytics/components/analytics-types";
import { generateChartConfig } from "@/views/customers/customer/analytics/utils/transformGroupedChartData";

const eventsFor = (columns: string[]): EventsData => ({
	meta: [{ name: "period" }, ...columns.map((name) => ({ name }))],
	rows: 1,
	data: [
		{
			period: "2026-08-20 00:00:00",
			...Object.fromEntries(columns.map((name) => [name, 1])),
		},
	],
});

const customerNames = {
	cus_named: { name: "Acme Inc", email: "ops@acme.com" },
	cus_email: { name: null, email: "solo@acme.com" },
};

const configFor = ({
	columns,
	groupBy,
}: {
	columns: string[];
	groupBy: string;
}) =>
	generateChartConfig({
		events: eventsFor(columns),
		features: [],
		groupBy,
		originalColors: [],
		customerNames,
	});

test("labels customer series by name, then email, then id", () => {
	const config = configFor({
		columns: [
			"messages_count__cus_named",
			"messages_count__cus_email",
			"messages_count__cus_unknown",
		],
		groupBy: "customer_id",
	});

	expect(config.map((series) => series.yName)).toEqual([
		"messages (Acme Inc)",
		"messages (solo@acme.com)",
		"messages (cus_unknown)",
	]);
});

test("carries the customer id on real customer series only", () => {
	const config = configFor({
		columns: [
			"messages_count__cus_named",
			"messages_count__AUTUMN_RESERVED",
			"messages_count__",
		],
		groupBy: "customer_id",
	});

	expect(config.map((series) => series.customerId)).toEqual([
		"cus_named",
		undefined,
		undefined,
	]);
	expect(config[1].yName).toBe("messages (Other values)");
});

test("never carries a customer id for other group-bys", () => {
	const config = configFor({
		columns: ["messages_count__ent_1"],
		groupBy: "entity_id",
	});

	expect(config[0].customerId).toBeUndefined();
});
