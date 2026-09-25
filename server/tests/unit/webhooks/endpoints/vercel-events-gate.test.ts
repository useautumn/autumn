/**
 * `vercel.*` events are public, but only orgs with Autumn's `vercel` feature may
 * subscribe to them. The gate dogfoods `autumn.check`, runs only when a vercel
 * event is present, and checks the billing customer (a sandbox's master org).
 */

import { describe, expect, test } from "bun:test";
import { ErrCode, type Organization, WebhookEventType } from "@autumn/shared";
import { assertVercelEventsAllowed } from "@/internal/webhooks/actions/assertVercelEventsAllowed";

const org = { id: "org_main", is_sandbox: false } as unknown as Organization;
const sandboxOrg = {
	id: "org_sub",
	is_sandbox: true,
	created_by: "org_main",
} as unknown as Organization;

const recordingCheck = (allowed: boolean) => {
	const calls: { customerId: string; featureId: string }[] = [];
	const checkFeature = async (args: {
		customerId: string;
		featureId: string;
	}) => {
		calls.push(args);
		return { allowed };
	};
	return { calls, checkFeature };
};

describe("assertVercelEventsAllowed", () => {
	test("no vercel event: allowed without calling autumn.check", async () => {
		const { calls, checkFeature } = recordingCheck(false);
		await assertVercelEventsAllowed({
			org,
			events: [WebhookEventType.BillingUpdated],
			checkFeature,
		});
		expect(calls).toEqual([]);
	});

	test("vercel event without the feature is rejected", async () => {
		const { calls, checkFeature } = recordingCheck(false);
		const promise = assertVercelEventsAllowed({
			org,
			events: [
				WebhookEventType.BillingUpdated,
				WebhookEventType.VercelWebhooksEvent,
			],
			checkFeature,
		});
		await expect(promise).rejects.toMatchObject({
			code: ErrCode.WebhookEventNotAvailable,
			statusCode: 403,
		});
		expect(calls).toEqual([{ customerId: "org_main", featureId: "vercel" }]);
	});

	test("vercel event with the feature passes; a sandbox checks its master org", async () => {
		const { calls, checkFeature } = recordingCheck(true);
		await assertVercelEventsAllowed({
			org: sandboxOrg,
			events: [WebhookEventType.VercelResourcesProvisioned],
			checkFeature,
		});
		expect(calls).toEqual([{ customerId: "org_main", featureId: "vercel" }]);
	});
});
