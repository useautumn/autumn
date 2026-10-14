/** Random set_plans previews built from the response schema, covering every field the review reads. */
export const randomSetPlansPreviews = ({
	count,
	seed,
}: {
	count: number;
	seed: number;
}) => {
	let state = seed;
	const random = () => {
		state = (state * 1103515245 + 12345) % 2147483648;
		return state / 2147483648;
	};
	const int = (max: number) => Math.floor(random() * max);
	const pick = <T>(items: readonly T[]) => items[int(items.length)];
	const chance = (p: number) => random() < p;
	const maybeNull = <T>(value: T, p = 0.3) => (chance(p) ? null : value);

	const day = 86_400_000;
	const base = Date.UTC(2026, 0, 1) + int(400) * day + int(day);
	const date = () =>
		pick([
			base,
			base + int(900) * day + int(day),
			base - int(60) * day,
			base + day,
		]);

	const FEATURES = [
		"messages",
		"seats",
		"credits",
		"words",
		"sso",
		"unknown_feature",
	];
	const features = [
		{ id: "messages", name: "Messages", type: "metered" },
		{ id: "seats", name: "Seats", type: "continuous_use" },
		{ id: "credits", name: "Credits", type: "credit_system" },
		{
			id: "words",
			name: "Words",
			type: "metered",
			display: { singular: "word", plural: "words" },
		},
		{ id: "sso", name: "SSO", type: "boolean" },
	];
	const PLANS = ["pro", "enterprise", "addon", "free", "seats_plan"];
	const ENTITIES = [null, null, "ent_a", "ent_b"];
	const CURRENCIES = ["usd", "eur", "gbp", "jpy"];
	const INTERVALS = [null, "day", "week", "month", "quarter", "year"] as const;
	const amount = () =>
		pick([0, 1, 0.01, 0.5, 19.99, 20, 1000, 18000, 37500.5, 1234567.89]);

	const tiers = () =>
		Array.from({ length: 1 + int(3) }, (_, index) => ({
			up_to: index === 2 ? null : (index + 1) * pick([10, 100, 1000]),
			unit_amount: pick([0, 0, 0.01, 1, 5]),
			flat_amount: pick([0, 10]),
		}));

	const price = (currency: string) => {
		const tiersMode = pick([null, null, null, "graduated", "volume"] as const);
		return {
			currency: chance(0.9) ? currency : pick(CURRENCIES),
			unit_amount: tiersMode
				? maybeNull(amount(), 0.7)
				: maybeNull(amount(), 0.1),
			interval: pick(INTERVALS),
			interval_count: pick([1, 1, 1, 2, 3, 12]),
			usage_type: pick(["licensed", "licensed", "metered"] as const),
			tiers_mode: tiersMode,
			tiers: tiersMode ? tiers() : null,
			units_per_quantity: pick([null, null, 1, 100, 1000]),
		};
	};

	const plan = ({
		currency,
		status,
	}: {
		currency: string;
		status?: "starts" | "ends" | "updated" | "kept";
	}) => {
		const planId = pick(PLANS);
		return {
			plan_id: planId,
			entity_id: pick(ENTITIES),
			name: pick([`Plan ${planId}`, planId, "", "Ünïcødé · plan"]),
			status: status ?? pick(["starts", "ends", "updated", "kept"] as const),
			custom: chance(0.3),
			ongoing: chance(0.3),
			expires_at: maybeNull(date(), 0.6),
			trial_ends_at: maybeNull(date(), 0.7),
			credit: maybeNull(pick([-1333.33, -0.01, 0, 25, -18000]), 0.7),
			prices: Array.from({ length: int(4) }, () => ({
				feature_id: chance(0.5) ? null : pick(FEATURES),
				price: price(currency),
			})),
		};
	};

	const apiPrice = () =>
		maybeNull(
			{
				amount: amount(),
				interval: pick([
					"month",
					"year",
					"week",
					"day",
					"quarter",
					"semi_annual",
					"one_off",
				]),
				interval_count: pick([1, 1, 3]),
			},
			0.2,
		);

	const planItem = () => ({
		feature_id: pick(FEATURES),
		included: pick([undefined, 0, 100, 5000]),
		reset: chance(0.6)
			? { interval: pick(["month", "year", "day", "one_off"]) }
			: null,
		price: chance(0.6)
			? {
					amount: pick([undefined, 0, 0.01, 2]),
					billing_units: pick([undefined, 1, 100]),
				}
			: null,
	});

	const planChange = (target: {
		plan_id: string;
		entity_id: string | null;
	}) => {
		const previous: Record<string, unknown> = {};
		if (chance(0.4)) previous.expires_at = maybeNull(date(), 0.4);
		if (chance(0.3)) previous.trial_ends_at = maybeNull(date(), 0.4);
		if (chance(0.2)) previous.canceled_at = maybeNull(date(), 0.5);
		if (chance(0.2)) previous.past_due = chance(0.5);
		const featureIds = Array.from({ length: int(3) }, () => pick(FEATURES));
		const isPurchase = chance(0.15);
		const snapshot = {
			plan_id: chance(0.9) ? target.plan_id : pick(PLANS),
			expires_at: maybeNull(date(), 0.5),
			trial_ends_at: maybeNull(date(), 0.6),
			canceled_at: maybeNull(date(), 0.7),
			past_due: chance(0.2),
		};
		return {
			entity_id: chance(0.9) ? target.entity_id : pick(ENTITIES),
			action: pick(["activated", "scheduled", "updated", "expired"]),
			...(isPurchase ? { purchase: snapshot } : { subscription: snapshot }),
			previous_attributes: Object.keys(previous).length > 0 ? previous : null,
			plan_change: chance(0.8)
				? {
						price_change: chance(0.6)
							? { previous: apiPrice(), current: apiPrice() }
							: undefined,
						item_changes: featureIds.flatMap((featureId) => {
							const kind = int(3);
							const created = {
								action: "created",
								feature_id: featureId,
								item: { ...planItem(), feature_id: featureId },
							};
							const deleted = {
								action: "deleted",
								feature_id: featureId,
								item: { ...planItem(), feature_id: featureId },
							};
							return kind === 0
								? [created]
								: kind === 1
									? [deleted]
									: [deleted, created];
						}),
					}
				: undefined,
			item_changes: [],
		};
	};

	const balance = () => ({
		granted: pick([0, 0, 100, 5000, 1234567]),
		remaining: pick([0, 40, 100, -5]),
		usage: pick([0, 60, 1000]),
		unlimited: chance(0.1),
		next_reset_at: maybeNull(date(), 0.3),
		overage_allowed: chance(0.3),
	});

	const balanceChange = () => {
		const after = balance();
		const previous: Record<string, unknown> = {};
		for (const key of Object.keys(after) as (keyof typeof after)[]) {
			if (chance(0.35)) previous[key] = balance()[key];
		}
		return {
			feature_id: pick(FEATURES),
			entity_id: pick(ENTITIES),
			behavior: pick([
				"added",
				"removed",
				"reset",
				"carried",
				"updated",
			] as const),
			balance: after,
			previous_attributes: previous,
			...(chance(0.2) && {
				pooled: {
					previous_total: maybeNull(pick([0, 100, 500]), 0.4),
					total: pick([100, 500]),
					contributors: pick([1, 2, 7]),
				},
			}),
		};
	};

	const processorItem = (currency: string) => {
		const featureId = chance(0.5) ? null : pick(FEATURES);
		return {
			price_id: maybeNull(
				pick(["price_a", "price_b", "price_c", "price_d"]),
				0.15,
			),
			plan_id: maybeNull(pick(PLANS), 0.2),
			feature_id: featureId,
			display_name: pick(["Pro", "Enterprise", "Seats", "Legacy item"]),
			feature_name: pick([null, null, "", "Messages", "Seats"]),
			quantity: maybeNull(pick([0, 1, 3, 1500]), 0.25),
			price: maybeNull(price(currency), 0.1),
			amount: maybeNull(amount(), 0.4),
			creates_price: chance(0.2),
			managed_by_autumn: chance(0.8),
		};
	};

	return Array.from({ length: count }, (_, caseIndex) => {
		const currency = pick(CURRENCIES);
		let at = date();
		const phases = Array.from({ length: int(6) }, (_, phaseIndex) => {
			if (phaseIndex > 0) at += pick([0, day, int(400) * day]);
			const plans = Array.from({ length: int(4) }, () => plan({ currency }));
			return {
				starts_at: at,
				starts_now: phaseIndex === 0 && chance(0.5),
				ends_subscription: chance(0.15),
				plans,
				plan_changes: plans
					.filter(() => chance(0.6))
					.map((target) => planChange(target)),
				balance_changes: Array.from({ length: int(4) }, balanceChange),
				processor_items: Array.from({ length: int(4) }, () =>
					processorItem(currency),
				),
			};
		});
		const removedPhases = Array.from({ length: int(3) }, () => ({
			starts_at:
				chance(0.3) && phases.length > 0 ? pick(phases).starts_at : date(),
			plans: Array.from({ length: int(3) }, () =>
				plan({ currency, status: "ends" }),
			),
		}));
		return {
			name: `random #${caseIndex}`,
			preview: {
				currency,
				phases,
				removed_phases: removedPhases,
				processor_changes: Array.from({ length: int(3) }, () => ({
					type: pick(["subscription", "subscription_schedule"] as const),
					id: maybeNull(pick(["sub_1", "sub_2", "sub_sched_1"]), 0.3),
					action: pick(["created", "updated", "released", "canceled"] as const),
				})),
			},
			features: chance(0.9) ? features : [],
			nowMs: chance(0.3) && phases.length > 0 ? pick(phases).starts_at : date(),
			endsAt: chance(0.5) ? undefined : date(),
		};
	});
};
