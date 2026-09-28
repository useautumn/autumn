/**
 * The webhooks block is linted before anything is sent. The id, https and
 * events rules come from the sync body's spec; url keys, env-var collisions,
 * the localhost guard and the empty-map warning are the config's own.
 */

import { expect, test } from "bun:test";
import { ConfigError, type LintIssue } from "../../src/generated/lintRuntime";
import { type Webhook, webhook } from "../../src/generated/webhooks";
import { atmn, splitWire } from "../../src/generated/wire";

const billing = (overrides: Partial<Webhook> = {}): Webhook =>
	webhook({
		id: "billing",
		events: ["billing.updated"],
		url: { sandbox: "https://staging.example.com/autumn" },
		...overrides,
	});

const issuesOf = (webhooks: Webhook[]): LintIssue[] => {
	try {
		atmn({ webhooks });
		return [];
	} catch (error) {
		if (error instanceof ConfigError) return error.issues;
		throw error;
	}
};

const messages = (webhooks: Webhook[]): string =>
	issuesOf(webhooks)
		.map((issue) => `${issue.path}: ${issue.message}`)
		.join("\n");

test("a clean webhook lints clean and rides the wire with its url map intact", () => {
	const document = atmn({
		webhooks: [
			billing({
				url: {
					live: "https://example.com/autumn",
					"qa-team": "https://qa.example.com/autumn",
				},
			}),
		],
	});
	const { lists, catalog, warnings } = splitWire(document);
	expect(warnings).toEqual([]);
	expect("webhooks" in catalog).toBe(false);
	expect(lists.webhooks?.[0]?.url).toEqual({
		live: "https://example.com/autumn",
		"qa-team": "https://qa.example.com/autumn",
	});
});

test("spec rules: id charset, https, and at least one event", () => {
	expect(messages([billing({ id: "bill ing" })])).toContain(
		"id must match ^[a-zA-Z0-9_-]+$",
	);
	expect(
		messages([billing({ url: { sandbox: "http://example.com/autumn" } })]),
	).toContain("url.sandbox must match ^[Hh][Tt][Tt][Pp][Ss]:");
	expect(messages([billing({ events: [] })])).toContain(
		"events must have at least 1 entry",
	);
});

test("localhost and private networks are refused in every env; a tunnel is not", () => {
	for (const url of [
		"https://localhost:3000/hook",
		"https://api.local/hook",
		"https://10.0.0.4/hook",
		"https://[fd12::1]/hook",
	]) {
		expect(messages([billing({ url: { live: url } })])).toContain(
			`url ${JSON.stringify(url)} is refused`,
		);
	}
	expect(
		issuesOf([billing({ url: { sandbox: "https://abc.ngrok.app/hook" } })]),
	).toEqual([]);
});

test("ids must be unique, and must not collide once turned into an env var name", () => {
	expect(messages([billing(), billing()])).toContain(
		'id "billing" is used more than once',
	);
	expect(messages([billing({ id: "Billing" }), billing()])).toContain(
		'id "billing" and "Billing" both read as BILLING in an env var name',
	);
	expect(messages([billing({ id: "a-b" }), billing({ id: "a_b" })])).toContain(
		'id "a_b" and "a-b" both read as A_B',
	);
});

test("the https scheme is matched case-insensitively, as the server reads it", () => {
	expect(
		issuesOf([
			billing({ url: { sandbox: "HTTPS://staging.example.com/autumn" } }),
		]),
	).toEqual([]);
	expect(
		messages([
			billing({ url: { sandbox: "HTTP://staging.example.com/autumn" } }),
		]),
	).toContain("url.sandbox must match");
});

test("url keys are live, sandbox or a sandbox slug: no spaces, no capitals", () => {
	expect(
		messages([billing({ url: { "qa team": "https://x.dev/h" } })]),
	).toContain('url key "qa team" must match ^[a-z0-9_-]+$');
	expect(messages([billing({ url: { Live: "https://x.dev/h" } })])).toContain(
		'url key "Live" must match',
	);
});

test("an empty url map is a warning carried beside the document, never a refusal", () => {
	const document = atmn({ webhooks: [billing({ url: {} })] });
	const { warnings } = splitWire(document);
	expect(warnings).toHaveLength(1);
	expect(warnings[0]?.path).toBe('webhook "billing"');
	expect(warnings[0]?.message).toContain("registered nowhere");
});

test("an event name this atmn doesn't know is a warning, never a refusal: the server checks it", () => {
	const document = atmn({
		webhooks: [
			billing({
				// A config pulled from a newer server; the type accepts any string.
				events: ["billing.updated", "billing.from_the_future"],
			}),
		],
	});
	const { warnings, lists } = splitWire(document);
	expect(warnings.map((warning) => warning.message)).toEqual([
		"`billing.from_the_future` isn't known to this atmn version; the server will check it.",
	]);
	expect(lists.webhooks?.[0]?.events).toEqual([
		"billing.updated",
		"billing.from_the_future",
	]);
});

test("vercel.* events can't share a webhook with other events", () => {
	expect(
		messages([
			billing({ events: ["vercel.resources.provisioned", "billing.updated"] }),
		]),
	).toContain("vercel.* events can't be mixed with other events");
	expect(
		issuesOf([
			billing({
				events: ["vercel.resources.provisioned", "vercel.resources.deleted"],
			}),
		]),
	).toEqual([]);
});
