import type { CustomerFilter } from "../../../filters/customerFilter.js";
import type { PlanFilter } from "../../../filters/planFilter.js";
import type { IRNav, IRNode, Quantifier } from "../../ir/irTypes.js";
import { isQuantifierWrapper } from "../helpers/isQuantifierWrapper.js";
import type { ResolutionContext } from "../resolutionContext.js";
import { parsePlanFilter } from "../scopes/parsePlanFilter.js";

const QUANTIFIER_KEYS: Record<string, Quantifier> = {
	$some: "some",
	$none: "none",
};

export function parsePlanNav({
	raw,
	ctx,
}: {
	raw: NonNullable<CustomerFilter["plan"]>;
	ctx: ResolutionContext;
}): IRNav {
	if (!isQuantifierWrapper(raw))
		return buildNav({ quantifier: "some", filter: raw as PlanFilter, ctx });

	for (const [key, quantifier] of Object.entries(QUANTIFIER_KEYS)) {
		const filter = (raw as Record<string, unknown>)[key] as
			| PlanFilter
			| undefined;
		if (filter !== undefined) return buildNav({ quantifier, filter, ctx });
	}

	const unsupported = Object.keys(raw).find((k) => k.startsWith("$"));
	throw new Error(
		`plan: ${unsupported ?? "unknown quantifier"} is not supported yet`,
	);
}

function buildNav({
	quantifier,
	filter,
	ctx,
}: {
	quantifier: Quantifier;
	filter: PlanFilter;
	ctx: ResolutionContext;
}): IRNav {
	const hasFields = Object.keys(filter).length > 0;
	const child: IRNode = hasFields
		? parsePlanFilter({ filter, ctx })
		: { kind: "and", children: [] };
	return { kind: "nav", name: "plan", quantifier, child };
}
