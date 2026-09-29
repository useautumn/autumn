import { describe, expect, test } from "bun:test";
import { findTrustedSlackBot } from "../../../../src/providers/slack/trustedBots.js";

const bill = {
	slack_id: "U_BILL",
	name: "Bill",
	run_as_user_id: "user_1",
	added_by_user_id: "user_1",
	added_at: 1,
};
const installation = { bot_user_id: "U_AUTUMN", trusted_bots: [bill] };

describe("findTrustedSlackBot", () => {
	test("matches a bot message on its member id", () => {
		expect(
			findTrustedSlackBot({
				installation,
				raw: { bot_id: "B_BILL", user: "U_BILL" },
			}),
		).toEqual(bill);
	});

	test("matches a bot message on its bot id", () => {
		const byBotId = { ...bill, slack_id: "B_BILL" };
		expect(
			findTrustedSlackBot({
				installation: { trusted_bots: [byBotId] },
				raw: { bot_id: "B_BILL", subtype: "bot_message" },
			}),
		).toEqual(byBotId);
	});

	test("never matches a person, even one whose member id is listed", () => {
		expect(
			findTrustedSlackBot({ installation, raw: { user: "U_BILL" } }),
		).toBeUndefined();
	});

	test("ignores bots that are not on the list, and the agent itself", () => {
		expect(
			findTrustedSlackBot({
				installation,
				raw: { bot_id: "B_OTHER", user: "U_OTHER" },
			}),
		).toBeUndefined();
		expect(
			findTrustedSlackBot({
				installation: {
					bot_user_id: "U_AUTUMN",
					trusted_bots: [{ ...bill, slack_id: "U_AUTUMN" }],
				},
				raw: { bot_id: "B_AUTUMN", user: "U_AUTUMN" },
			}),
		).toBeUndefined();
	});
});
