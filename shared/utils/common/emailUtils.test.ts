import { describe, expect, test } from "bun:test";
import { CustomerDataSchema } from "../../api/common/customerData";
import { isPermissiveEmail } from "./emailUtils";

describe("isPermissiveEmail", () => {
	describe("accepts patterns Zod incorrectly rejects", () => {
		test("apostrophe immediately before @", () => {
			expect(isPermissiveEmail("foo'@bar.com")).toBe(true);
			expect(
				isPermissiveEmail("bortuna.matteo'@istitutonervialaimo.edu.it"),
			).toBe(true);
		});

		test("apostrophe mid-local", () => {
			expect(isPermissiveEmail("o'brien@example.com")).toBe(true);
		});

		test("%-aliased Workspace addresses", () => {
			expect(
				isPermissiveEmail("pranayp%officebeacon.com@gtempaccount.com"),
			).toBe(true);
			expect(
				isPermissiveEmail("james.maher%kornferry.com@gtempaccount.com"),
			).toBe(true);
		});

		test("punycode IDN TLDs", () => {
			expect(isPermissiveEmail("user@example.xn--p1ai")).toBe(true);
			expect(isPermissiveEmail("user@xn--mnchen-3ya.de")).toBe(true);
		});
	});

	describe("accepts common signup addresses", () => {
		const valid = [
			"o'brien@example.com",
			"john.q.public@example.com",
			"j_doe@example.com",
			"user+tag@example.com",
			"12345@example.com",
			"user@example.museum",
			"a@b.co",
			"POSTMASTER@example.com",
			"jose.maria@example.com",
			"user@sub.deep.example.com",
			"user-name@example-host.com",
		];
		test.each(valid.map((v) => [v]))("%s", (input) => {
			expect(isPermissiveEmail(input)).toBe(true);
		});
	});

	describe("rejects out-of-scope patterns", () => {
		const cases: Array<[string, string]> = [
			["user@mail_server.example.com", "underscore in domain"],
			["user@münchen.de", "raw unicode domain"],
			["用户@example.com", "raw unicode local"],
			["user@example.com.", "trailing-dot FQDN"],
			["user@[127.0.0.1]", "IPv4 literal"],
			["user@[IPv6:2001:db8::1]", "IPv6 literal"],
			["user&me@example.com", "& in local"],
			["user!chief@example.com", "! in local"],
			["user#1@example.com", "# in local"],
			["user?q@example.com", "? in local"],
			["foo@bar.c", "single-letter TLD"],
			["foo@bar.123", "all-numeric TLD"],
			["user@1.2.3.4", "unbracketed IP"],
		];
		test.each(cases)("%s (%s)", (input) => {
			expect(isPermissiveEmail(input)).toBe(false);
		});
	});

	describe("rejects malformed addresses", () => {
		const SPACE = String.fromCharCode(0x20);
		const NL = String.fromCharCode(0x0a);
		const TAB = String.fromCharCode(0x09);
		const NUL = String.fromCharCode(0x00);
		const longLocal = `${"a".repeat(65)}@example.com`;
		const longDomainLabel = `user@${"a".repeat(64)}.com`;
		const longTotal = `user@${"a".repeat(250)}.com`;

		const cases: Array<[string, string]> = [
			["", "empty"],
			["no-at-sign", "missing @"],
			["@no-local.com", "empty local"],
			["no-domain@", "empty domain"],
			["8615919252438", "raw phone, no @"],
			["393406157378", "raw phone, no @"],
			["missingatsign.com", "no @"],
			["+81080 8130 9089@phone.runable.com", "whitespace in local"],
			[`spaces${SPACE}in@example.com`, "whitespace in local"],
			[`user@no${SPACE}tld.com`, "whitespace in domain"],
			["user@no-tld", "domain has no dot"],
			[".leading@example.com", "leading dot in local"],
			["trailing.@example.com", "trailing dot in local"],
			["two..dots@example.com", "consecutive dots in local"],
			[longLocal, "local > 64 chars"],
			[longTotal, "total > 254 chars"],
			["user@.example.com", "domain starts with dot"],
			["user@example..com", "consecutive dots in domain"],
			["user@-example.com", "domain label starts with hyphen"],
			["user@example-.com", "domain label ends with hyphen"],
			[longDomainLabel, "domain label > 63 chars"],
			[`user${TAB}@example.com`, "tab in local"],
			[`user@example.com${NL}`, "trailing newline"],
			[`user${NUL}@example.com`, "NUL byte"],
			["a@b@example.com", "multiple @"],
			["user@@example.com", "consecutive @"],
		];

		test.each(cases)("%s (%s)", (input) => {
			expect(isPermissiveEmail(input)).toBe(false);
		});
	});

	describe("boundary cases", () => {
		test("local part exactly 64 chars", () => {
			expect(isPermissiveEmail(`${"a".repeat(64)}@example.com`)).toBe(true);
		});

		test("domain label exactly 63 chars", () => {
			expect(isPermissiveEmail(`user@${"a".repeat(63)}.com`)).toBe(true);
		});

		test("total length exactly 254 chars", () => {
			const label = "a".repeat(63);
			const finalLabel = `${"a".repeat(53)}.com`;
			const email = `user@${label}.${label}.${label}.${finalLabel}`;
			expect(email.length).toBe(254);
			expect(isPermissiveEmail(email)).toBe(true);
		});
	});
});

describe("CustomerDataSchema email field", () => {
	const parse = (email: unknown) =>
		CustomerDataSchema.safeParse({ name: "test", email });

	test("accepts apostrophe-before-@", () => {
		expect(
			parse("bortuna.matteo'@istitutonervialaimo.edu.it").success,
		).toBe(true);
	});

	test("accepts %-aliased Workspace addresses", () => {
		expect(
			parse("pranayp%officebeacon.com@gtempaccount.com").success,
		).toBe(true);
	});

	test("accepts punycode IDN TLDs", () => {
		expect(parse("user@example.xn--p1ai").success).toBe(true);
	});

	test("accepts null/undefined", () => {
		expect(parse(null).success).toBe(true);
		expect(parse(undefined).success).toBe(true);
	});

	test("rejects raw unicode domain", () => {
		expect(parse("user@münchen.de").success).toBe(false);
	});

	test("rejects underscore in domain", () => {
		expect(parse("user@mail_server.example.com").success).toBe(false);
	});

	test("rejects raw phone number", () => {
		const result = parse("8615919252438");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].message).toBe("not a valid email address");
		}
	});

	test("rejects empty string", () => {
		expect(parse("").success).toBe(false);
	});
});
