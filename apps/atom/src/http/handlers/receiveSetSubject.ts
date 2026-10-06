import type { Context } from "hono";
import { applySubjectPush } from "../../pushes/applyPushes.js";
import { pushPhaseMs } from "../../pushes/pushPhaseMs.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

export function receiveSetSubject(context: Context<AtomHttpEnv>) {
	const applyStartedAt = performance.now();
	const stored = applySubjectPush({
		slots: context.get("slots"),
		body: context.get("body"),
	});
	pushPhaseMs.apply += performance.now() - applyStartedAt;
	return context.json({ stored });
}
