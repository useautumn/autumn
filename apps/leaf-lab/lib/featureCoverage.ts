import { askJev, type JevMeasurement } from "./jev.js";

export type EffectivePlan = {
	actionIndex: number;
	phaseIndex?: number;
	planId: unknown;
	sourceKnown: boolean;
	addOn?: boolean;
	items?: unknown[];
};
type Feature = { id: string; name?: string; type?: string };

const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const catalogFeatures = (evidence: unknown): Feature[] => {
	const list = record(record(record(evidence).facts).listFeatures).list;
	return Array.isArray(list)
		? list.flatMap((entry) => {
				const feature = record(entry);
				return typeof feature.id === "string"
					? [
							{
								id: feature.id,
								name:
									typeof feature.name === "string" ? feature.name : undefined,
								type:
									typeof feature.type === "string" ? feature.type : undefined,
							},
						]
					: [];
			})
		: [];
};

const label = (feature: Feature) =>
	feature.name ? `"${feature.name}" (id ${feature.id})` : `id ${feature.id}`;

const targetLabel = (plan: EffectivePlan) =>
	`action ${plan.actionIndex}${plan.phaseIndex === undefined ? "" : ` phase ${plan.phaseIndex}`} plan ${String(plan.planId)}`;

const scopeRule =
	"Judge ONLY this plan target and ONLY the requirements the user assigns to it. A requirement stated for a different phase, plan, date or customer does NOT apply here, even if it uses the word 'retain' or 'keep' for that other phase. Inherited catalog items count as present. Answer from the user's actual words and documents, never from assistant summaries.";

/** Decomposes feature/allowance coverage into one literal question per
 * absent feature or finite allowance, so a composite judgment cannot contradict
 * the explicit effective-plan evidence. */
export const buildFeatureCoverageQuestions = ({
	evidence,
	effectivePlans,
}: {
	evidence: unknown;
	effectivePlans: EffectivePlan[];
}) => {
	const features = catalogFeatures(evidence);
	const questions: Record<string, string> = {};
	const meanings: Record<
		string,
		{
			target: string;
			featureId: string;
			kind: "absent" | "quantity" | "unpurchased" | "pricing";
		}
	> = {};
	for (const plan of effectivePlans) {
		if (!plan.sourceKnown) continue;
		const target = targetLabel(plan);
		const key = `coverage_${plan.actionIndex}_${plan.phaseIndex ?? "x"}_${String(plan.planId)}`;
		const items = (plan.items ?? []).map((item) => record(item));
		const present = new Map(
			items.map((item) => [String(item.feature_id), item] as const),
		);
		const priced = items.filter(
			(item) => item.price && typeof item.price === "object",
		);
		const pricedByFeature = new Map<string, Record<string, unknown>[]>();
		for (const item of priced) {
			const id = String(item.feature_id);
			pricedByFeature.set(id, [...(pricedByFeature.get(id) ?? []), item]);
		}
		for (const [featureId, slots] of pricedByFeature) {
			const feature = features.find((entry) => entry.id === featureId) ?? {
				id: featureId,
			};
			const summary = slots
				.map((item) => {
					const price = record(item.price);
					const rate = Array.isArray(price.tiers)
						? `${price.tiers.length} prepaid tiers`
						: `${String(price.amount)} per unit`;
					return `${String(price.billing_method)} slot (${rate}, included ${String(item.included)})`;
				})
				.join("; ");
			questions[`${key}__pricing__${featureId}`] =
				`${target}: the effective plan prices ${label(feature)} through ${slots.length} slot(s): ${summary}. Does the user's request or source document state a pricing model for this feature in THIS plan target that this set of slots contradicts, for example a single per-unit overage rate where a prepaid tier ladder also remains, a rate different from the stated one, or paid pricing where the user asked for none? Catalog pricing the user never mentioned is acceptable. ${scopeRule}`;
			meanings[`${key}__pricing__${featureId}`] = {
				target,
				featureId,
				kind: "pricing",
			};
		}
		if (!plan.addOn)
			for (const feature of features) {
				if (present.has(feature.id)) continue;
				questions[`${key}__absent__${feature.id}`] =
					`${target}: the effective plan does NOT include the feature ${label(feature)}. Does the user's request explicitly require this feature to be included, enabled or unlimited in THIS specific plan target (${target})? ${scopeRule}`;
				meanings[`${key}__absent__${feature.id}`] = {
					target,
					featureId: feature.id,
					kind: "absent",
				};
			}
		for (const [featureId, item] of present) {
			const feature = features.find((entry) => entry.id === featureId) ?? {
				id: featureId,
			};
			if (
				!plan.addOn &&
				(feature.type === "boolean" || item.unlimited === true)
			) {
				questions[`${key}__unpurchased__${featureId}`] =
					`${target}: the effective plan INCLUDES the feature ${label(feature)} (inherited from the catalog plan or added). Does the user's request or source document define the purchased package for THIS plan target as a closed list that EXCLUDES this feature, so that including it grants something not purchased? A document that lists the purchased features exhaustively excludes unlisted ones. If the request only names additions and never defines a closed package, answer no. ${scopeRule}`;
				meanings[`${key}__unpurchased__${featureId}`] = {
					target,
					featureId,
					kind: "unpurchased",
				};
			}
			if (feature.type === "boolean" || item.unlimited === true) continue;
			if (typeof item.included !== "number") continue;
			questions[`${key}__quantity__${featureId}`] =
				`${target}: the effective plan includes ${item.included} of ${label(feature)}${record(item.reset).interval ? ` resetting every ${String(record(item.reset).interval)}` : ""}. Does the user's request specify a DIFFERENT included quantity, reset cadence, or unlimited access for this feature in THIS plan target? ${scopeRule}`;
			meanings[`${key}__quantity__${featureId}`] = {
				target,
				featureId,
				kind: "quantity",
			};
		}
	}
	return { questions, meanings };
};

/** Two-pass coverage: first decide, per target and feature, whether the user
 * assigns ANY requirement to that pair; only pairs with an assigned
 * requirement are then judged for omission. This stops a requirement stated
 * for one phase from being misread against a different phase. */
export const verifyFeatureCoverage = async ({
	evidence,
	effectivePlans,
	onMeasurement,
}: {
	evidence: unknown;
	effectivePlans: EffectivePlan[];
	onMeasurement: (measurement: JevMeasurement) => void;
}) => {
	const { questions, meanings } = buildFeatureCoverageQuestions({
		evidence,
		effectivePlans,
	});
	const assignment = Object.fromEntries(
		Object.entries(meanings)
			.filter(([, meaning]) => meaning.kind === "absent")
			.map(([key, meaning]) => [
				`${key}__assigned`,
				`Does the user's request or source document state ANY explicit requirement about the feature ${meaning.featureId} that is addressed to THIS exact plan target: ${meaning.target}? Statements about other phases, other plans, other dates or other customers do not count, even if they reuse words like retain, keep or include. Answer strictly from the user's words.`,
			]),
	);
	const assigned: Record<string, number> = {};
	const assignmentEntries = Object.entries(assignment);
	for (let start = 0; start < assignmentEntries.length; start += 60) {
		Object.assign(
			assigned,
			await askJev({
				state: { evidence, effectivePlans },
				questions: Object.fromEntries(
					assignmentEntries.slice(start, start + 60),
				),
				onMeasurement,
			}),
		);
	}
	const entries = Object.entries(questions).filter(
		([key, _q]) =>
			meanings[key].kind !== "absent" ||
			(assigned[`${key}__assigned`] ?? 0) >= 0.5,
	);
	const answers: Record<string, number> = { ...assigned };
	for (let start = 0; start < entries.length; start += 60) {
		Object.assign(
			answers,
			await askJev({
				state: { evidence, effectivePlans },
				questions: Object.fromEntries(entries.slice(start, start + 60)),
				onMeasurement,
			}),
		);
	}
	const failures = Object.entries(answers)
		.filter(([name, probability]) => name in meanings && probability >= 0.5)
		.map(([name]) => {
			const meaning = meanings[name];
			if (meaning.kind === "absent")
				return `${meaning.target} omits requested feature ${meaning.featureId}`;
			if (meaning.kind === "unpurchased")
				return `${meaning.target} grants ${meaning.featureId}, which the purchased package excludes; remove it`;
			if (meaning.kind === "pricing")
				return `${meaning.target} prices ${meaning.featureId} differently from the stated pricing model; use exactly the stated slot(s)`;
			return `${meaning.target} has a different requested allowance for ${meaning.featureId}`;
		});
	return { answers, failures };
};
