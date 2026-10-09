import {
	AtomSubjectReadErrorCode,
	AtomSubjectReadRequestSchema,
} from "@autumn/byoc";
import type { Context } from "hono";
import { getOrgWithFeaturesCached } from "@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js";
import { readAtomSubject } from "../actions/subjects/readAtomSubject.js";
import type { AtomHonoEnv } from "../types/atomHonoEnv.js";

const READ_FAILURE_STATUS = {
	not_found: 404,
	not_held: 409,
	worker_unavailable: 503,
} as const;

const READ_FAILURE_CODE = {
	not_found: AtomSubjectReadErrorCode.SubjectNotFound,
	not_held: AtomSubjectReadErrorCode.SubjectNotHeld,
	worker_unavailable: AtomSubjectReadErrorCode.WorkerUnavailable,
} as const;

/** An org's Atom pulls a subject it missed: the exact subjects.set body herald would push it. */
export async function handleReadAtomSubject(c: Context<AtomHonoEnv>) {
	const parsed = AtomSubjectReadRequestSchema.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return c.json({ message: "Invalid request" }, 400);
	const ctx = c.get("ctx");
	const atom = c.get("atom");
	const orgWithFeatures = await getOrgWithFeaturesCached({
		db: ctx.db,
		orgId: atom.orgId,
		env: atom.env,
	});
	if (!orgWithFeatures)
		return c.json(
			{ code: AtomSubjectReadErrorCode.AtomUnknown, message: "Unknown Atom" },
			401,
		);
	const result = await readAtomSubject({
		ctx,
		org: orgWithFeatures.org,
		atom,
		customerId: parsed.data.customer_id,
		entityId: parsed.data.entity_id,
	});
	if (result.kind === "body") return c.json(result.body);
	return c.json(
		{ code: READ_FAILURE_CODE[result.kind], message: result.kind },
		READ_FAILURE_STATUS[result.kind],
	);
}
