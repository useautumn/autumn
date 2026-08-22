import { productAliases } from "@autumn/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const listAliases = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) =>
	ctx.db
		.select()
		.from(productAliases)
		.where(
			and(
				eq(productAliases.org_id, ctx.org.id),
				eq(productAliases.env, ctx.env),
				or(
					inArray(productAliases.alias_id, planIds),
					inArray(productAliases.canonical_plan_id, planIds),
				),
			),
		);

export const deleteAliases = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	await ctx.db
		.delete(productAliases)
		.where(
			and(
				eq(productAliases.org_id, ctx.org.id),
				eq(productAliases.env, ctx.env),
				or(
					inArray(productAliases.alias_id, planIds),
					inArray(productAliases.canonical_plan_id, planIds),
				),
			),
		);
};

export const renamePlan = async ({
	autumn,
	fromId,
	toId,
}: {
	autumn: AutumnInt;
	fromId: string;
	toId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: fromId, new_plan_id: toId }],
	});
};

/** Walk a preview/response and return every plan_id / plan_ids string. */
export const collectResponsePlanIds = (value: unknown): string[] => {
	if (value == null || typeof value !== "object") return [];
	if (Array.isArray(value)) return value.flatMap(collectResponsePlanIds);

	const record = value as Record<string, unknown>;
	const ids: string[] = [];
	for (const [key, nested] of Object.entries(record)) {
		if (key === "plan_id" && typeof nested === "string") ids.push(nested);
		if (key === "plan_ids" && Array.isArray(nested)) {
			ids.push(
				...nested.filter((item): item is string => typeof item === "string"),
			);
		}
		ids.push(...collectResponsePlanIds(nested));
	}
	return ids;
};
