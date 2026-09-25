/**
 * webhooks.preview_sync is PATCH, like organization.preview_update:
 * - a stated id with no remote webhook is a `create`;
 * - a stated id whose url/events/description/disabled differ is an `update`
 *   (events compared as a set; omitted description/disabled are left alone);
 * - a remote webhook the request doesn't state is `unmanaged`, never deleted;
 * - a stated webhook that already matches produces no change;
 * - a new id whose URL matches exactly one uid-less (dashboard-made) endpoint
 *   adopts it; several matches are an error, never a create; an endpoint with
 *   a uid is never adopted.
 */

import { describe, expect, test } from "bun:test";
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
	expect(changes.errors).toEqual([]);
	expect(changes.changes).toEqual([
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
	expect(changes.changes).toEqual([]);
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
	expect(changes.changes).toEqual([
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
	expect(urlOnly.changes.map((change) => change.action)).toEqual(["update"]);
});

test("a remote webhook the request doesn't state is unmanaged", () => {
	const dashboardMade = remote({ id: "ep_3JouCXZ8St4UOFxRDgqmbGBlaez" });
	const changes = computeWebhookSyncChanges({
		remote: [dashboardMade, remote({ id: "other" })],
		stated: [stated({ id: "other" })],
		now: NOW,
	});
	expect(changes.changes).toEqual([
		{
			action: "unmanaged",
			id: "ep_3JouCXZ8St4UOFxRDgqmbGBlaez",
			webhook: dashboardMade,
		},
	]);
});

describe("adopting dashboard-made webhooks", () => {
	const dashboard = (id: string, url = "https://example.com/hook") =>
		remote({ id, url, events: ["invoice.finalized"] as WebhookEventType[] });

	test("a new id whose URL matches exactly one uid-less endpoint adopts it", () => {
		const before = dashboard("ep_dash1");
		const other = dashboard("ep_dash2", "https://example.com/other");
		const result = computeWebhookSyncChanges({
			remote: [before, other],
			uidlessIds: new Set(["ep_dash1", "ep_dash2"]),
			stated: [stated({ description: "adopted" })],
			now: NOW,
		});
		expect(result.errors).toEqual([]);
		expect(result.changes).toEqual([
			{
				action: "adopt",
				id: "billing",
				before,
				after: {
					...before,
					id: "billing",
					events: [
						"invoice.finalized",
						"billing.updated",
					] as WebhookEventType[],
					description: "adopted",
				},
			},
			{ action: "unmanaged", id: "ep_dash2", webhook: other },
		]);
	});

	test("several uid-less endpoints with the URL is an error, never a create", () => {
		const result = computeWebhookSyncChanges({
			remote: [dashboard("ep_dash1"), dashboard("ep_dash2")],
			uidlessIds: new Set(["ep_dash1", "ep_dash2"]),
			stated: [stated()],
			now: NOW,
		});
		expect(result.changes.map((change) => change.action)).toEqual([
			"unmanaged",
			"unmanaged",
		]);
		expect(result.errors).toEqual([
			{
				id: "billing",
				message: expect.stringContaining("2 dashboard webhooks"),
			},
		]);
	});

	test("two new ids with the URL of one uid-less endpoint are both errors", () => {
		const result = computeWebhookSyncChanges({
			remote: [dashboard("ep_dash1")],
			uidlessIds: new Set(["ep_dash1"]),
			stated: [stated(), stated({ id: "billing-2" })],
			now: NOW,
		});
		expect(result.changes.map((change) => change.action)).toEqual([
			"unmanaged",
		]);
		expect(result.errors.map((error) => error.id)).toEqual([
			"billing",
			"billing-2",
		]);
	});

	test("an endpoint that already has a uid is never adopted: the new id is created", () => {
		const owned = remote({ id: "someone-else" });
		const result = computeWebhookSyncChanges({
			remote: [owned],
			uidlessIds: new Set(),
			stated: [stated()],
			now: NOW,
		});
		expect(result.changes.map((change) => change.action)).toEqual([
			"create",
			"unmanaged",
		]);
	});
});

test("a stated ep_ id of a dashboard webhook updates it, even when its URL changes", () => {
	const dashboard = remote({ id: "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5" });
	const changes = computeWebhookSyncChanges({
		remote: [dashboard],
		uidlessIds: new Set([dashboard.id]),
		stated: [stated({ id: dashboard.id, url: "https://example.com/moved" })],
		now: NOW,
	});
	expect(changes.errors).toEqual([]);
	expect(changes.changes).toEqual([
		{
			action: "update",
			id: dashboard.id,
			before: dashboard,
			after: { ...dashboard, url: "https://example.com/moved" },
		},
	]);
});

test("a webhook can't move between the Vercel app and the main app: error, no change", () => {
	const inVercel = remote({
		id: "provisioning",
		events: ["vercel.resources.provisioned"] as WebhookEventType[],
	});
	const changes = computeWebhookSyncChanges({
		remote: [remote(), inVercel],
		remoteKinds: new Map([["provisioning", "vercel"]]),
		stated: [
			stated({ events: ["vercel.resources.deleted"] as WebhookEventType[] }),
			stated({
				id: "provisioning",
				events: ["billing.updated"] as WebhookEventType[],
			}),
		],
		now: NOW,
	});
	expect(
		changes.changes.filter((change) => change.action !== "unmanaged"),
	).toEqual([]);
	expect(changes.errors.map((error) => error.id)).toEqual([
		"billing",
		"provisioning",
	]);
	expect(changes.errors[0]?.message).toContain("make a new webhook");
});

test("adoption only takes a dashboard webhook from the app the stated events belong to", () => {
	const dashboardMain = remote({
		id: "ep_2Qx7c9LmNpRsTuVwXyZa1b3d4e5",
		url: "https://example.com/shared",
	});
	const changes = computeWebhookSyncChanges({
		remote: [dashboardMain],
		uidlessIds: new Set([dashboardMain.id]),
		stated: [
			stated({
				id: "provisioning",
				url: "https://example.com/shared",
				events: ["vercel.resources.provisioned"] as WebhookEventType[],
			}),
		],
		now: NOW,
	});
	expect(
		changes.changes.find((change) => change.id === "provisioning")?.action,
	).toBe("create");
});
