import { describe, expect, test } from "bun:test";
import { addSeconds, subMilliseconds } from "date-fns";
import { AppEnv } from "../models/genModels/genEnums";
import { createChatInstallState, verifyChatInstallState } from "./chatState";

describe("chat OAuth state", () => {
	test("round-trips a signed install state", () => {
		const state = createChatInstallState({
			secret: "secret",
			provider: "slack",
			orgId: "org_123",
			userId: "user_123",
			env: AppEnv.Live,
			expiresAt: addSeconds(Date.now(), 1).getTime(),
			nonce: "nonce",
		});

		expect(verifyChatInstallState(state, "secret")).toMatchObject({
			provider: "slack",
			orgId: "org_123",
			userId: "user_123",
			env: AppEnv.Live,
		});
	});

	test("rejects invalid or expired state", () => {
		const expired = createChatInstallState({
			secret: "secret",
			provider: "discord",
			orgId: "org_123",
			userId: "user_123",
			env: AppEnv.Sandbox,
			expiresAt: subMilliseconds(Date.now(), 1).getTime(),
			nonce: "nonce",
		});

		expect(verifyChatInstallState(expired, "secret")).toBeNull();
		expect(verifyChatInstallState("not-valid", "secret")).toBeNull();
		expect(verifyChatInstallState(expired, "wrong-secret")).toBeNull();
	});
});
