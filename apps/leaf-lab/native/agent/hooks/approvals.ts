import { defineHook } from "eve/hooks";
import { nativeBridgeRequest } from "../../lib/protocol.js";

export default defineHook({
	events: {
		"message.received": async (event, ctx) => {
			await nativeBridgeRequest("/user-message", {
				sessionId: ctx.session.id,
				message: event.data.message,
				turnId: event.data.turnId,
			});
		},
		"input.requested": async (event, ctx) => {
			await nativeBridgeRequest("/pending", {
				sessionId: ctx.session.id,
				requests: event.data.requests,
			});
		},
		"input.resolved": async (event, ctx) => {
			await nativeBridgeRequest("/settled", {
				sessionId: ctx.session.id,
				resolutions: event.data.resolutions,
			});
		},
	},
});
