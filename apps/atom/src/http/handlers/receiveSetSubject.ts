import type { Context } from "hono";
import { applySubjectPush } from "../../pushes/applyPushes.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export function receiveSetSubject(context: Context<AtomHttpEnv>) {
	const stored = applySubjectPush({
		slots: context.get("slots"),
		body: context.get("body"),
	});
	return context.json({ stored });
}
