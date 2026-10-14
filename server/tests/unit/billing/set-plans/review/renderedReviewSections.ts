import type {
	Feature,
	SetPlansPreviewPhase,
	SetPlansPreviewRemovedPhase,
	SetPlansPreviewResponse,
	SetPlansReviewText,
} from "@autumn/shared";
import { format } from "date-fns";
import { balancesReviewSection } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/balancesReviewSection";
import { planChangeLines } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/planChangeLines";
import { plansReviewSection } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/plansReviewSection";
import { subscriptionReviewSection } from "@/internal/billing/v2/actions/setPlans/preview/reviewSections/subscriptionReviewSection";

const TEXT_FIELDS = new Set([
	"label",
	"range",
	"description",
	"summary",
	"before",
	"after",
]);
const UI_NAMES: Record<string, string> = {
	entity_id: "entityId",
	trial_ends_at: "trialEndsAt",
	is_basis: "isBasis",
	stripe_ids: "stripeIds",
};

type RenderedRow = {
	key: string;
	title: string;
	description?: string;
	status?: string;
	changes?: { state: string; label: string; before?: string; after?: string }[];
	trialEndsAt?: number;
	ongoing?: boolean;
	pooled?: {
		previous_total: number | null;
		total: number;
		contributors: number;
	};
	value?: { amount: string; suffix?: string; isBasis?: boolean };
	quantity?: string;
	entityId?: string | null;
};

type RenderedSection = {
	phases: {
		key: string;
		label: string;
		range?: string;
		badge?: string;
		removed?: boolean;
		rows: RenderedRow[];
	}[];
	summary: string;
	stripeIds?: { key: string; label: string; id: string }[];
};

/** The review as the dashboard shows it: dates formatted, UI field names. */
const rendered = (value: unknown, field?: string): any => {
	if (field && TEXT_FIELDS.has(field) && Array.isArray(value)) {
		return (value as SetPlansReviewText)
			.map((part) =>
				typeof part === "string" ? part : format(part.date, "MMM d, yyyy"),
			)
			.join("");
	}
	if (Array.isArray(value)) return value.map((item) => rendered(item));
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) => [UI_NAMES[key] ?? key, rendered(entry, key)]),
		);
	}
	return value;
};

export const renderedPlans = ({
	phases,
	removedPhases = [],
	features,
	currency,
	nowMs,
}: {
	phases: SetPlansPreviewPhase[];
	removedPhases?: SetPlansPreviewRemovedPhase[];
	features: Feature[];
	currency: string;
	nowMs: number;
}): RenderedSection =>
	rendered(
		plansReviewSection({
			preview: { phases, removed_phases: removedPhases, currency },
			features,
			currentEpochMs: nowMs,
		}),
	);

export const renderedBalances = ({
	phases,
	features,
}: {
	phases: SetPlansPreviewPhase[];
	features: Feature[];
}): RenderedSection =>
	rendered(balancesReviewSection({ preview: { phases }, features }));

export const renderedSubscription = ({
	preview,
	nowMs,
	endsAt,
}: {
	preview: SetPlansPreviewResponse;
	nowMs: number;
	endsAt?: number | null;
}): RenderedSection =>
	rendered(
		subscriptionReviewSection({
			preview,
			currentEpochMs: nowMs,
			endsAt: endsAt ?? undefined,
		}),
	);

export const renderedChangeLines = (
	args: Parameters<typeof planChangeLines>[0],
): NonNullable<RenderedRow["changes"]> => rendered(planChangeLines(args));
