import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import type { Context } from "hono";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import { applySubjectPush } from "../../pushes/applyPushes.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

export const receiveSetSubject = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "replication">;
}) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const customerId = context.req.header(ATOM_CUSTOMER_ID_HEADER);
		if (!customerId)
			throw new InvalidPushError(
				`A subjects.set push needs the ${ATOM_CUSTOMER_ID_HEADER} header`,
			);
		const stored = await applySubjectPush({
			slots: context.get("slots"),
			customerId,
			body: await context.req.text(),
			replication: ctx.replication,
			relayed: context.get("relayed"),
		});
		return context.json({ stored });
	};
