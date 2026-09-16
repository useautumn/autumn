import { expect, test } from "bun:test";
import {
	type BalanceShadowConfig,
	type BalanceShadowFormValues,
	buildBalanceShadowConfig,
	getBalanceShadowFormValues,
} from "@/views/admin/components/balanceShadowConfig";

const now = Date.UTC(2026, 8, 14, 12);
const config: BalanceShadowConfig = {
	enabled: true,
	run: {
		runId: "run-1",
		ownershipTopic: "shadow.ownership",
		expiresAt: now + 3_600_123,
		customers: [
			{
				orgId: "org-1",
				env: "sandbox",
				customerId: "external-id",
				featureId: "messages",
			},
		],
	},
};

test.concurrent(
	"editing preserves identifiers and the exact expiry across local time conversion",
	() => {
		const values = getBalanceShadowFormValues({ config });
		expect(new Date(values.expiresAt).getTime()).toBe(config.run.expiresAt);
		expect(buildBalanceShadowConfig({ values, now })).toEqual({
			success: true,
			config,
		});
		expect(values.customers[0].rowId).toBeString();
	},
);

test.concurrent(
	"off discards the old run even if its form is invalid or expired",
	() => {
		const values = getBalanceShadowFormValues({
			config: { enabled: false },
			now,
		});
		values.expiresAt = "";
		values.customers = [];
		expect(buildBalanceShadowConfig({ values, now })).toEqual({
			success: true,
			config: { enabled: false },
		});
	},
);

test.concurrent(
	"new form defaults to off with a sandbox row and a one-hour expiry",
	() => {
		const values = getBalanceShadowFormValues({
			config: { enabled: false },
			now,
		});
		expect(values.enabled).toBe(false);
		expect(values.customers).toHaveLength(1);
		expect(values.customers[0].env).toBe("sandbox");
		expect(new Date(values.expiresAt).getTime()).toBe(now + 3_600_000);
	},
);

const invalidCases: {
	label: string;
	change: (values: BalanceShadowFormValues) => void;
	error: string;
}[] = [
	{
		label: "missing run",
		change: (values) => {
			values.runId = "  ";
		},
		error: "Run ID",
	},
	{
		label: "long topic",
		change: (values) => {
			values.ownershipTopic = "x".repeat(201);
		},
		error: "Ownership topic",
	},
	{
		label: "empty expiry",
		change: (values) => {
			values.expiresAt = "";
		},
		error: "Expiry",
	},
	{
		label: "past expiry",
		change: (values) => {
			values.expiresAt = "2020-01-01T00:00";
		},
		error: "Expiry",
	},
	{
		label: "distant expiry",
		change: (values) => {
			values.expiresAt = "2030-01-01T00:00";
		},
		error: "Expiry",
	},
	{
		label: "empty cohort",
		change: (values) => {
			values.customers = [];
		},
		error: "1–20",
	},
	{
		label: "large cohort",
		change: (values) => {
			values.customers = Array.from({ length: 21 }, () => values.customers[0]);
		},
		error: "1–20",
	},
	{
		label: "missing customer ID",
		change: (values) => {
			values.customers[0].customerId = " ";
		},
		error: "Entry 1",
	},
	{
		label: "duplicate",
		change: (values) => {
			values.customers.push({
				...values.customers[0],
				rowId: "second",
				customerId: " external-id ",
			});
		},
		error: "Duplicate",
	},
	{
		label: "byte cap",
		change: (values) => {
			values.customers = Array.from({ length: 20 }, (_, index) => ({
				rowId: String(index),
				orgId: "é".repeat(200),
				env: "live",
				customerId: String(index).padEnd(200, "x"),
				featureId: "é".repeat(200),
			}));
		},
		error: "16 KiB",
	},
];

test.concurrent.each(invalidCases)(
	"invalid form cannot produce a save payload: $label",
	({ change, error }) => {
		const values = getBalanceShadowFormValues({ config });
		change(values);
		const result = buildBalanceShadowConfig({ values, now });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error).toContain(error);
	},
);

test.concurrent(
	"entries for different environments and features are distinct",
	() => {
		const values = getBalanceShadowFormValues({ config });
		values.customers.push({
			...values.customers[0],
			rowId: "live",
			env: "live",
		});
		values.customers.push({
			...values.customers[0],
			rowId: "feature",
			featureId: "seats",
		});
		expect(buildBalanceShadowConfig({ values, now }).success).toBe(true);
	},
);
