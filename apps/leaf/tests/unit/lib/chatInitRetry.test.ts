import { expect, test } from "bun:test";
import { Chat, type StateAdapter } from "chat";

/** A state adapter whose first connect fails, like Postgres refusing a login
 * while the chat database is out of connection slots. */
const flakyState = () => {
	let connectCalls = 0;
	const state = {
		connect: async () => {
			connectCalls += 1;
			if (connectCalls === 1) throw new Error("remaining connection slots");
		},
		disconnect: async () => {},
	} as unknown as StateAdapter;
	return { state, connectCalls: () => connectCalls };
};

test("a failed chat init is retried instead of cached", async () => {
	const { state, connectCalls } = flakyState();
	const chat = new Chat({ userName: "leaf", adapters: {}, state });

	await expect(chat.initialize()).rejects.toThrow("remaining connection slots");
	await chat.initialize();

	expect(connectCalls()).toBe(2);
});
