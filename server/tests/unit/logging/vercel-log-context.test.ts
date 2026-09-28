import { AppEnv, AuthType } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	buildVercelEventContext,
	enrichVercelAppLogger,
} from "@/external/vercel/misc/vercelLogContext.js";

const createCapturingLogger = () => {
	const childCalls: unknown[] = [];
	const logger = {
		child: (args: unknown) => {
			childCalls.push(args);
			return logger;
		},
	} as Logger;

	return { logger, childCalls };
};

describe("vercelLogContext", () => {
	test("builds Vercel event fields from marketplace invoice payloads", () => {
		expect(
			buildVercelEventContext({
				id: "evt_123",
				type: "marketplace.invoice.paid",
				payload: {
					installationId: "icfg_123",
					invoiceId: "vi_123",
					externalInvoiceId: "in_123",
					resourceId: "vre_123",
				},
			}),
		).toEqual({
			id: "evt_123",
			type: "marketplace.invoice.paid",
			installation_id: "icfg_123",
			invoice_id: "vi_123",
			external_invoice_id: "in_123",
			resource_id: "vre_123",
		});
	});

	test("emits Vercel app context with auth and customer fields", () => {
		const { logger, childCalls } = createCapturingLogger();
		const ctx = {
			logger,
			org: { id: "org_123", slug: "acme" },
			env: AppEnv.Live,
			authType: AuthType.Unknown,
			customerId: "cus_123",
			entityId: "ent_123",
			apiVersion: { semver: "1.2.0" },
			scopes: ["customers:read"],
			rolloutSnapshot: {
				rolloutId: "v2-cache",
				enabled: true,
				percent: 100,
				previousPercent: 50,
				changedAt: 1,
				customerBucket: 42,
			},
		} as AutumnContext;

		expect(enrichVercelAppLogger({ ctx })).toBe(logger);
		expect(childCalls).toEqual([
			{
				context: {
					context: {
						org_id: "org_123",
						org_slug: "acme",
						env: AppEnv.Live,
						auth_type: AuthType.Vercel,
						customer_id: "cus_123",
						entity_id: "ent_123",
						api_version: "1.2.0",
						scopes: ["customers:read"],
						full_subject_bucket: 42,
						full_subject_rollout_enabled: true,
					},
				},
			},
		]);
	});
});
