import type { Context } from "hono";

export function receiveHealth(context: Context) {
	return context.json({ status: "alive" });
}
