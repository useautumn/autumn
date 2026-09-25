/**
 * The webhook param schemas are the contract atmn's lint and the API share:
 * - URLs must be https, and ones pointing at localhost/private networks are
 *   rejected in every env; tunnels pass.
 * - ids follow `[a-zA-Z0-9_-]` (Svix's uid rule minus `.`), 1..256; get/update/delete
 *   also accept the `ep_…` id list shows for dashboard-made endpoints.
 * - `events` is required and non-empty (empty would mean "all events" in Svix).
 * - sync rejects the same id twice.
 */

import { describe, expect, test } from "bun:test";
import {
	CreateWebhookParamsSchema,
	GetWebhookParamsSchema,
	isLocalWebhookUrl,
	SyncWebhooksParamsSchema,
	UpdateWebhookParamsSchema,
} from "@autumn/shared";

const params = (overrides: Record<string, unknown> = {}) => ({
	id: "billing",
	url: "https://example.com/hooks",
	events: ["billing.updated"],
	...overrides,
});

const accepts = (overrides: Record<string, unknown>) =>
	CreateWebhookParamsSchema.safeParse(params(overrides)).success;

describe("isLocalWebhookUrl", () => {
	test.each([
		"https://localhost:3000/hook",
		"https://LOCALHOST/hook",
		"https://localhost./hook",
		"https://api.localhost/hook",
		"https://my-mac.local/hook",
		"https://127.0.0.1/hook",
		"https://127.8.9.10/hook",
		"https://2130706433/hook",
		"https://0.0.0.0:8080/hook",
		"https://10.1.2.3/hook",
		"https://172.16.0.1/hook",
		"https://172.31.255.255/hook",
		"https://192.168.1.10/hook",
		"https://169.254.169.254/latest",
		"https://[::1]:8080/hook",
		"https://[fe80::1]/hook",
		"https://[::ffff:127.0.0.1]/hook",
		"https://[fd12::1]/hook",
		"https://[fc00::5]/hook",
	])("rejects %s", (url) => {
		expect(isLocalWebhookUrl(url)).toBe(true);
	});

	test.each([
		"https://example.com/hook",
		"https://abc123.ngrok-free.app/hook",
		"https://random-words.trycloudflare.com/hook",
		"https://172.32.0.1/hook",
		"https://11.0.0.1/hook",
		"https://localhost.example.com/hook",
		"https://[2606:4700::1111]/hook",
	])("allows %s", (url) => {
		expect(isLocalWebhookUrl(url)).toBe(false);
	});
});

describe("webhook params", () => {
	test("url: https only; localhost rejected, tunnel accepted", () => {
		expect(accepts({ url: "http://example.com/hook" })).toBe(false);
		expect(accepts({ url: "https://localhost:3000/hook" })).toBe(false);
		expect(accepts({ url: "https://abc.ngrok-free.app/hook" })).toBe(true);
		expect(accepts({ url: "ftp://example.com/hook" })).toBe(false);
		expect(accepts({ url: "https://example.com/hook" })).toBe(true);
		expect(accepts({ url: "not a url" })).toBe(false);
	});

	test("id: letters, digits, _ and -, 1..256", () => {
		expect(accepts({ id: "Billing_v2-prod" })).toBe(true);
		expect(accepts({ id: "billing.v2" })).toBe(false);
		expect(accepts({ id: "billing v2" })).toBe(false);
		expect(accepts({ id: "billing/v2" })).toBe(false);
		expect(accepts({ id: "bîlling" })).toBe(false);
		expect(accepts({ id: "" })).toBe(false);
		expect(accepts({ id: "a".repeat(256) })).toBe(true);
		expect(accepts({ id: "a".repeat(257) })).toBe(false);
	});

	test("id on get/update/delete also takes a dashboard endpoint's ep_ id", () => {
		expect(
			GetWebhookParamsSchema.safeParse({ id: "ep_3JouCXZ8St4UOFxRDgqmbGBlaez" })
				.success,
		).toBe(true);
		expect(GetWebhookParamsSchema.safeParse({ id: "bad id" }).success).toBe(
			false,
		);
	});

	test("events: required, non-empty, known types only", () => {
		expect(accepts({ events: [] })).toBe(false);
		expect(accepts({ events: undefined })).toBe(false);
		expect(accepts({ events: ["not.a.type"] })).toBe(false);
		expect(accepts({ events: ["vercel.webhooks.event"] })).toBe(true);
		expect(
			UpdateWebhookParamsSchema.safeParse({ id: "billing", events: [] })
				.success,
		).toBe(false);
	});

	test("update has no way to rename: an unknown new id is stripped", () => {
		const parsed = UpdateWebhookParamsSchema.parse({
			id: "billing",
			new_id: "renamed",
		});
		expect(parsed).toEqual({ id: "billing" });
	});

	test("sync rejects the same id twice", () => {
		expect(
			SyncWebhooksParamsSchema.safeParse({
				webhooks: [params(), params({ url: "https://example.com/other" })],
			}).success,
		).toBe(false);
		expect(
			SyncWebhooksParamsSchema.safeParse({
				webhooks: [params(), params({ id: "other" })],
			}).success,
		).toBe(true);
	});
});
