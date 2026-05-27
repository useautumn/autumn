/**
 * Email validation in CustomerDataSchema must accept everything Google
 * Workspace marks as a valid username, including characters zod's default
 * `z.email()` rejects (&, =, <, >, ',', !, %, ^, accents, trailing symbols).
 *
 * Reference: https://support.google.com/a/answer/9193374
 *
 * Red-failure mode (current behavior):
 *  - z.email() with the default pattern rejects every "permissive" case below,
 *    so `customers.getOrCreate` returns 400 for legitimate Workspace emails.
 *
 * Green-success criteria (after fix):
 *  - All Google Workspace valid emails parse successfully via CustomerDataSchema.
 *  - Inputs without an "@" still fail (i.e. we're not regressing to anything goes).
 *  - .nullish() behavior preserved (null + undefined still allowed).
 */

import { describe, expect, test } from "bun:test";
import { CustomerDataSchema } from "@autumn/shared";

const expectAccept = (email: string) => {
	const result = CustomerDataSchema.safeParse({ email });
	if (!result.success) {
		throw new Error(
			`Expected email "${email}" to be accepted, got: ${JSON.stringify(result.error.issues)}`,
		);
	}
	expect(result.data.email).toBe(email);
};

const expectReject = (email: unknown) => {
	const result = CustomerDataSchema.safeParse({ email });
	expect(result.success).toBe(false);
};

describe("CustomerDataSchema email — Google Workspace acceptance", () => {
	// Plain ASCII baselines that were already accepted.
	test.each([
		"john@example.com",
		"john.doe@example.com",
		"john+tag@example.co.uk",
		"a@b.co",
	])("accepts standard email %s", (email) => {
		expectAccept(email);
	});

	// Characters Google explicitly allows in usernames that the default
	// zod email regex rejects.
	test.each([
		// Apostrophes
		["apostrophe in local", "o'brien@example.com"],
		// Ampersand
		["ampersand in local", "a&b@example.com"],
		// Equals sign
		["equals in local", "a=b@example.com"],
		// Angle brackets
		["angle brackets in local", "user<tag>@example.com"],
		// Plus already works but include for completeness
		["plus in local", "user+tag@example.com"],
		// Comma
		["comma in local", "first,last@example.com"],
		// Exclamation
		["exclamation in local", "wow!@example.com"],
		// Percent
		["percent in local", "100%@example.com"],
		// Caret
		["caret in local", "up^stairs@example.com"],
	])("accepts Google-allowed special char (%s)", (_label, email) => {
		expectAccept(email);
	});

	test.each([
		// Accented latin
		["é", "josé@example.com"],
		// CJK
		["chinese", "用户@example.com"],
		// Cyrillic
		["cyrillic", "пользователь@example.com"],
		// Arabic
		["arabic", "مستخدم@example.com"],
	])("accepts unicode local-part (%s)", (_label, email) => {
		expectAccept(email);
	});

	test.each([
		// Google: "Can begin or end with non-alphanumeric characters except periods (.)"
		["trailing apostrophe", "user'@example.com"],
		["trailing ampersand", "user&@example.com"],
		["leading underscore", "_user@example.com"],
		["leading dash", "-user@example.com"],
	])("accepts non-alphanumeric boundary (%s)", (_label, email) => {
		expectAccept(email);
	});

	test("accepts subdomain + multi-label TLD", () => {
		expectAccept("user@mail.googleworkspace.co.uk");
	});

	test("accepts null email (nullish preserved)", () => {
		const result = CustomerDataSchema.safeParse({ email: null });
		expect(result.success).toBe(true);
	});

	test("accepts undefined email (nullish preserved)", () => {
		const result = CustomerDataSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	test("rejects strings missing @", () => {
		expectReject("not-an-email");
	});

	test("rejects strings with whitespace", () => {
		expectReject("user name@example.com");
	});

	test("rejects whitespace in domain", () => {
		expectReject("user@exa mple.com");
	});

	test("rejects empty string", () => {
		expectReject("");
	});

	test("rejects local part longer than 64 chars", () => {
		expectReject(`${"a".repeat(65)}@example.com`);
	});

	test("rejects non-string types", () => {
		expectReject(42);
		expectReject({});
		expectReject([]);
		expectReject(true);
	});

	// Regression: every form previously accepted by z.email() must keep parsing.
	test.each([
		"simple@example.com",
		"first.last@example.com",
		"first+last@example.com",
		"first_last@example.com",
		"first-last@example.com",
		"a.b.c.d@example.com",
		"123@example.com",
		"user@sub.example.com",
		"user@example.co.uk",
		"user@a-domain-with-dashes.com",
	])("regression: %s still accepted", (email) => {
		expectAccept(email);
	});

	// Sanity: surrounding CustomerDataSchema fields keep working.
	test("schema still validates other fields alongside email", () => {
		const result = CustomerDataSchema.safeParse({
			name: "Jane",
			email: "jane@example.com",
			fingerprint: "fp-1",
			stripe_id: "cus_123",
			metadata: { plan: "pro" },
			create_in_stripe: true,
			send_email_receipts: false,
		});
		expect(result.success).toBe(true);
	});
});
