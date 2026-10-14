import { describe, expect, test } from "bun:test";
import { getAddPasskeyErrorMessage } from "@/views/settings/sections/components/passkeyErrorMessage";

describe("getAddPasskeyErrorMessage", () => {
	test("stale session asks the user to log in again", () => {
		const message = getAddPasskeyErrorMessage({
			error: {
				code: "SESSION_NOT_FRESH",
				message: "Session is not fresh",
				status: 403,
			},
		});

		expect(message).toBe("Please log out and log in again to set a passkey.");
	});

	test("dismissed WebAuthn prompt shows no toast", () => {
		expect(
			getAddPasskeyErrorMessage({
				error: {
					code: "ERROR_CEREMONY_ABORTED",
					message: "Registration cancelled",
				},
			}),
		).toBeNull();
	});

	test("other errors keep the server message", () => {
		expect(
			getAddPasskeyErrorMessage({
				error: {
					code: "PREVIOUSLY_REGISTERED",
					message: "Previously registered",
				},
			}),
		).toBe("Previously registered");
	});
});
