/**
 * webhooks.preview_sync is PATCH, like organization.preview_update:
 * - a stated id with no remote webhook is a `create`;
 * - a stated id whose url/events/description/disabled differ is an `update`
 *   (events compared as a set; omitted description/disabled are left alone);
 * - a remote webhook the request doesn't state is `unmanaged`, never deleted;
 * - a stated webhook that already matches produces no change.
 */

import { expect, test } from "bun:test";
import type { Webhook, WebhookEventType } from "@autumn/shared";
import { computeWebhookSyncChanges } from "@/internal/webhooks/actions/sync/computeWebhookSyncChanges";

const NOW = 1_790_000_000_000;

const remote = (overrides: Partial<Webhook> = {}): Webhook => ({
	id: "billing",
	url: "https://example.com/hook",
	description: null,
	events: ["billing.updated", "invoice.finalized"] as WebhookEventType[],
	disabled: false,
	created_at: 1,
	updated_at: 2,
	...overrides,
});

const stated = (overrides: Record<string, unknown> = {}) => ({
	id: "billing",
	url: "https://example.com/hook",
	events: ["invoice.finalized", "billing.updated"] as WebhookEventType[],
	...overrides,
});

test("a stated id with no remote webhook is a create", () => {
	const changes = computeWebhookSyncChanges({
		remote: [],
		stated: [stated({ description: "prod billing" })],
		now: NOW,
	});
	expect(changes).toEqual([
		{
			action: "create",
			id: "billing",
			webhook: {
				id: "billing",
				url: "https://example.com/hook",
				description: "prod billing",
				events: ["invoice.finalized", "billing.updated"] as WebhookEventType[],
				disabled: false,
				created_at: NOW,
				updated_at: NOW,
			},
		},
	]);
});

test("same fields in another event order is no change; omitted description/disabled are left alone", () => {
	const changes = computeWebhookSyncChanges({
		remote: [remote({ description: "set in dashboard", disabled: true })],
		stated: [stated()],
		now: NOW,
	});
	expect(changes).toEqual([]);
});

test("a differing url, events, description or disabled is an update with before and after", () => {
	const before = remote();
	const changes = computeWebhookSyncChanges({
		remote: [before],
		stated: [
			stated({
				url: "https://example.com/new",
				events: ["billing.updated"],
				description: "",
				disabled: true,
			}),
		],
		now: NOW,
	});
	expect(changes).toEqual([
		{
			action: "update",
			id: "billing",
			before,
			after: {
				...before,
				url: "https://example.com/new",
				events: ["billing.updated"] as WebhookEventType[],
				disabled: true,
			},
		},
	]);

	const urlOnly = computeWebhookSyncChanges({
		remote: [before],
		stated: [stated({ url: "https://example.com/moved" })],
		now: NOW,
	});
	expect(urlOnly.map((change) => change.action)).toEqual(["update"]);
});

test("a remote webhook the request doesn't state is unmanaged", () => {
	const dashboardMade = remote({ id: "ep_3JouCXZ8St4UOFxRDgqmbGBlaez" });
	const changes = computeWebhookSyncChanges({
		remote: [dashboardMade, remote({ id: "other" })],
		stated: [stated({ id: "other" })],
		now: NOW,
	});
	expect(changes).toEqual([
		{
			action: "unmanaged",
			id: "ep_3JouCXZ8St4UOFxRDgqmbGBlaez",
			webhook: dashboardMade,
		},
	]);
});
