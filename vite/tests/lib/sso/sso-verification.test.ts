import { expect, test } from "bun:test";
import {
	formatVerificationExpiry,
	isVerificationExpired,
} from "@/lib/sso/ssoVerification";

test("detects an expired verification record", () => {
	const now = new Date("2026-07-28T12:00:00Z");
	expect(isVerificationExpired("2026-07-28T11:59:00Z", now)).toBe(true);
	expect(isVerificationExpired("2026-07-28T12:00:00Z", now)).toBe(true);
	expect(isVerificationExpired("2026-07-29T00:00:00Z", now)).toBe(false);
});

test("treats an unparseable expiry as not expired and unformattable", () => {
	expect(isVerificationExpired("not-a-date")).toBe(false);
	expect(formatVerificationExpiry("not-a-date")).toBeNull();
});

test("formats a parseable expiry", () => {
	expect(formatVerificationExpiry("2026-07-28T12:00:00Z")).toMatch(
		/^\d{1,2} \w{3} 2026, \d{2}:\d{2}$/,
	);
});
