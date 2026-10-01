import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import {
	isInRequestScope,
	type RequestEntityScope,
} from "@/internal/billing/v2/actions/setPlans/timeline/savedTimeline/isInRequestScope";
import type { UndeclaredPlansPolicy } from "@/internal/billing/v2/actions/setPlans/timeline/types/setPlansPolicies";
import type { TimelineRow } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineRow";
import type { DesiredSegment } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineSegment";
import { describeReview } from "./timelineDescribe";
import {
	B,
	B2,
	desiredSegment,
	desiredTimeline,
	PAST,
	type PlanKind,
	plan,
	policiesFor,
	savedRow,
	type TestPlan,
} from "./timelineFixtures";
import {
	expectAllInvariants,
	expectIdempotent,
	type TimelineCase,
} from "./timelineInvariants";

const PLAN_KINDS: PlanKind[] = ["main", "addOn", "free", "oneOff"];
const PRIOR_STATES = [
	"none",
	"active",
	"scheduled",
	"canceling",
	"pastDue",
	"endsAtB",
] as const;
const HOW_ADDED = ["attach", "schedule", "ongoing"] as const;
const OPERATIONS = [
	"keep",
	"remove",
	"update",
	"add",
	"moveDate",
	"newPhase",
	"deletePhase",
	"toOngoing",
] as const;
const SCOPES = [
	"customer",
	"entity",
	"otherSubscription",
	"unrepresentedEntity",
] as const;
const OUT_OF_SCOPE: Scope[] = ["otherSubscription", "unrepresentedEntity"];
const POLICIES: UndeclaredPlansPolicy[] = ["end", "retain"];

type PriorState = (typeof PRIOR_STATES)[number];
type HowAdded = (typeof HOW_ADDED)[number];
type Operation = (typeof OPERATIONS)[number];
type Scope = (typeof SCOPES)[number];

type TableCase = {
	kind: PlanKind;
	prior: PriorState;
	howAdded: HowAdded;
	operation: Operation;
	scope: Scope;
	policy: UndeclaredPlansPolicy;
};

const SUBJECT_IDS: Record<PlanKind, string> = {
	main: "subject_main",
	addOn: "subject_addon",
	free: "subject_free",
	oneOff: "subject_credits",
};

const background = plan({ planId: "background", kind: "addOn" });

type Interval = { startsAt: number; endsAt: number | null };

const SAVED_INTERVALS: Record<PriorState, Interval | null> = {
	none: null,
	active: { startsAt: PAST, endsAt: null },
	scheduled: { startsAt: B, endsAt: null },
	canceling: { startsAt: PAST, endsAt: B2 },
	pastDue: { startsAt: PAST, endsAt: null },
	endsAtB: { startsAt: PAST, endsAt: B },
};

/** The request that lists the subject exactly as saved. */
const KEPT_INTERVALS: Record<PriorState, Interval | null> = {
	none: null,
	active: { startsAt: 0, endsAt: null },
	scheduled: { startsAt: B, endsAt: null },
	canceling: { startsAt: 0, endsAt: null },
	pastDue: { startsAt: 0, endsAt: null },
	endsAtB: { startsAt: 0, endsAt: B },
};

const subjectRows = ({
	tableCase,
	subject,
	entity,
}: {
	tableCase: TableCase;
	subject: TestPlan;
	entity: string | null;
}): TimelineRow[] => {
	const interval = SAVED_INTERVALS[tableCase.prior];
	if (!interval) return [];

	const rowOptions = {
		plan: subject,
		entity,
		canceling: tableCase.prior === "canceling",
		pastDue: tableCase.prior === "pastDue",
	};
	const splitsLikeALegacySchedule =
		tableCase.howAdded === "schedule" &&
		interval.startsAt < B &&
		(interval.endsAt === null || interval.endsAt > B);
	if (!splitsLikeALegacySchedule) {
		return [savedRow({ id: "subject_row", ...rowOptions, ...interval })];
	}
	return [
		savedRow({
			id: "subject_row",
			...rowOptions,
			startsAt: interval.startsAt,
			endsAt: B,
		}),
		savedRow({
			id: "subject_row_later",
			...rowOptions,
			startsAt: B,
			endsAt: interval.endsAt,
		}),
	];
};

type SubjectSegment = Interval & { hash: string };

const startOf = (startsAt: number) => (startsAt === 0 ? undefined : startsAt);

/** What the request asks of the subject, or null when the operation means nothing for that prior state. */
const requestedSubjectSegments = ({
	tableCase,
}: {
	tableCase: TableCase;
}): SubjectSegment[] | null => {
	const kept = KEPT_INTERVALS[tableCase.prior];
	const keptSegment = kept ? [{ ...kept, hash: "h1" }] : [];

	switch (tableCase.operation) {
		case "keep":
			return keptSegment;
		case "remove":
			return kept ? [] : null;
		case "update":
			return kept ? [{ ...kept, hash: "h2" }] : null;
		case "add":
			return kept ? null : [{ startsAt: 0, endsAt: null, hash: "h1" }];
		case "moveDate":
			if (tableCase.prior === "scheduled") {
				return [{ startsAt: B2, endsAt: null, hash: "h1" }];
			}
			if (tableCase.prior === "endsAtB") {
				return [{ startsAt: 0, endsAt: B2, hash: "h1" }];
			}
			return null;
		case "newPhase": {
			const splits = kept && (kept.endsAt === null || kept.endsAt > B2);
			if (!kept || !splits) return null;
			return [
				{ startsAt: kept.startsAt, endsAt: B2, hash: "h1" },
				{ startsAt: B2, endsAt: kept.endsAt, hash: "h2" },
			];
		}
		case "deletePhase":
			if (tableCase.prior === "scheduled") return [];
			if (tableCase.prior === "endsAtB") {
				return [{ startsAt: 0, endsAt: null, hash: "h1" }];
			}
			return null;
		case "toOngoing":
			return tableCase.prior === "endsAtB"
				? [{ startsAt: 0, endsAt: null, hash: "h1" }]
				: null;
		default: {
			const unreachable: never = tableCase.operation;
			return unreachable;
		}
	}
};

const isOutOfScope = (tableCase: TableCase) =>
	OUT_OF_SCOPE.includes(tableCase.scope);

const isMeaningful = (tableCase: TableCase) => {
	if (isOutOfScope(tableCase)) {
		return (
			tableCase.prior !== "none" &&
			tableCase.howAdded === "attach" &&
			tableCase.operation === "remove"
		);
	}
	const lifetimeMisfit =
		tableCase.kind === "oneOff" &&
		(tableCase.prior === "canceling" ||
			tableCase.prior === "endsAtB" ||
			tableCase.operation === "newPhase");
	const provenanceMisfit =
		tableCase.prior === "none" && tableCase.howAdded !== "attach";
	return (
		!lifetimeMisfit &&
		!provenanceMisfit &&
		requestedSubjectSegments({ tableCase }) !== null
	);
};

/** A one-off in a new config is another purchase beside the saved one, never a replacement. */
const isSecondPurchase = ({
	tableCase,
	hash,
}: {
	tableCase: TableCase;
	hash: string;
}) =>
	tableCase.kind === "oneOff" &&
	hash !== "h1" &&
	SAVED_INTERVALS[tableCase.prior] !== null;

const SCOPE_ENTITIES: Record<Scope, string | null> = {
	customer: null,
	entity: "entity_1",
	otherSubscription: null,
	unrepresentedEntity: "entity_2",
};

/** Setup's scope filter: rows on another subscription, or on another entity of an entity-level request, stay out. */
const inRequestScope = ({
	tableCase,
	rows,
}: {
	tableCase: TableCase;
	rows: TimelineRow[];
}) => {
	const entityScope: RequestEntityScope =
		tableCase.scope === "unrepresentedEntity"
			? new Set<string | null>([SCOPE_ENTITIES.entity, null])
			: "allEntities";
	const stripeScopeCustomerProductIds =
		tableCase.scope === "otherSubscription"
			? new Set(
					rows
						.filter(({ planId }) => planId !== SUBJECT_IDS[tableCase.kind])
						.map(({ customerProductId }) => customerProductId),
				)
			: undefined;
	return rows.filter((row) =>
		isInRequestScope({
			customerProductId: row.customerProductId,
			internalEntityId: row.internalEntityId,
			stripeScopeCustomerProductIds,
			entityScope,
		}),
	);
};

const buildCase = (tableCase: TableCase): TimelineCase => {
	const subject = plan({
		planId: SUBJECT_IDS[tableCase.kind],
		kind: tableCase.kind,
	});
	const entity = SCOPE_ENTITIES[tableCase.scope];
	const subjectSegments = (requestedSubjectSegments({ tableCase }) ?? []).map(
		(segment, index): DesiredSegment =>
			desiredSegment({
				plan: subject,
				entity,
				hash: segment.hash,
				slot: isSecondPurchase({ tableCase, hash: segment.hash }) ? 1 : 0,
				startsAt: startOf(segment.startsAt),
				endsAt: segment.endsAt,
				phaseIndex: index,
				planIndex: 1,
			}),
	);

	const desiredSegments = [
		desiredSegment({ plan: background }),
		...subjectSegments,
	];
	return {
		rows: inRequestScope({
			tableCase,
			rows: [
				savedRow({ id: "background_row", plan: background }),
				...subjectRows({ tableCase, subject, entity }),
			],
		}),
		desired: desiredTimeline({ segments: desiredSegments }),
		policies: policiesFor({ undeclared: tableCase.policy }),
	};
};

const allCases = PLAN_KINDS.flatMap((kind) =>
	PRIOR_STATES.flatMap((prior) =>
		HOW_ADDED.flatMap((howAdded) =>
			OPERATIONS.flatMap((operation) =>
				SCOPES.flatMap((scope) =>
					POLICIES.map(
						(policy): TableCase => ({
							kind,
							prior,
							howAdded,
							operation,
							scope,
							policy,
						}),
					),
				),
			),
		),
	),
).filter(isMeaningful);

const caseName = (tableCase: TableCase) =>
	`${tableCase.kind} · ${tableCase.prior} via ${tableCase.howAdded} · ${tableCase.operation} · ${tableCase.scope} · ${tableCase.policy}`;

describe(chalk.yellowBright("diffTimelines: generated table"), () => {
	test("covers every meaningful combination", () => {
		expect(allCases.length).toBeGreaterThan(300);
	});

	for (const tableCase of allCases) {
		test(caseName(tableCase), () => {
			const timelineCase = buildCase(tableCase);
			const result = expectAllInvariants(timelineCase);
			const { diff, review } = result;

			if (tableCase.operation === "keep" || isOutOfScope(tableCase)) {
				expectIdempotent(result);
			}
			if (isOutOfScope(tableCase)) {
				const subjectId = SUBJECT_IDS[tableCase.kind];
				expect(
					diff.timeline.filter(({ planId }) => planId === subjectId),
				).toEqual([]);
				expect(describeReview(review).join()).not.toContain(subjectId);
			}

			const attachTwin = buildCase({ ...tableCase, howAdded: "attach" });
			const { review: attachReview } = expectAllInvariants(attachTwin);
			expect(describeReview(review)).toEqual(describeReview(attachReview));
		});
	}
});
