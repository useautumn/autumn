import Stripe from "stripe";

// Normalize items for comparison (order-agnostic, price id as string)
const normalizePhaseItems = (
  items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]
) => {
  return items
    .map((item) => ({
      price: item.price as string,
      quantity: item.quantity || 0,
    }))
    .sort((a, b) => {
      if (a.price === b.price) return (a.quantity || 0) - (b.quantity || 0);
      return a.price.localeCompare(b.price);
    });
};

// Compare two item lists for equality (same length, same price+quantity pairs)
const haveSameItems = (
  a: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[],
  b: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]
) => {
  if (a.length !== b.length) return false;
  const na = normalizePhaseItems(a);
  const nb = normalizePhaseItems(b);
  for (let i = 0; i < na.length; i++) {
    if (na[i].price !== nb[i].price) return false;
    if ((na[i].quantity || 0) !== (nb[i].quantity || 0)) return false;
  }
  return true;
};

// Check if a phase has no items
const hasNoItems = (phase: Stripe.SubscriptionScheduleUpdateParams.Phase) => {
  const items =
    (phase.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) || [];
  return items.length === 0;
};

// Remove empty phases and adjust dates to maintain timeline continuity
const removeEmptyPhasesAndAdjustDates = (
  phases: Stripe.SubscriptionScheduleUpdateParams.Phase[]
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
  if (!phases || phases.length <= 1) return phases;

  const result: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];

    if (!hasNoItems(phase)) {
      const clonedPhase = structuredClone(phase);

      // If this is not the first non-empty phase, we need to check if there were
      // empty phases before it and extend the previous non-empty phase to cover the gap
      if (result.length > 0) {
        const prevPhase = result[result.length - 1];

        // Find if there are empty phases between the previous non-empty phase and current
        let hasEmptyPhasesBetween = false;
        for (let j = i - 1; j >= 0; j--) {
          const checkPhase = phases[j];
          if (!hasNoItems(checkPhase)) {
            // Found the previous non-empty phase
            break;
          }
          hasEmptyPhasesBetween = true;
        }

        // If there were empty phases, extend the previous phase's end_date to current phase's start_date
        if (hasEmptyPhasesBetween && clonedPhase.start_date) {
          prevPhase.end_date = clonedPhase.start_date;
        }
      }

      result.push(clonedPhase);
    }
  }

  return result;
};

// Merge adjacent phases that have identical items
export const mergeAdjacentPhasesWithSameItems = (
  phases: Stripe.SubscriptionScheduleUpdateParams.Phase[]
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
  if (!phases || phases.length <= 1) return phases;

  // First, remove empty phases and adjust dates to maintain continuity
  const nonEmptyPhases = removeEmptyPhasesAndAdjustDates(phases);

  if (nonEmptyPhases.length <= 1) return nonEmptyPhases;

  // Then, merge adjacent phases with same items
  const merged: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];
  let current = structuredClone(nonEmptyPhases[0]);

  for (let i = 1; i < nonEmptyPhases.length; i++) {
    const next = nonEmptyPhases[i];
    const same = haveSameItems(
      (current.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) ||
        [],
      (next.items as Stripe.SubscriptionScheduleUpdateParams.Phase.Item[]) || []
    );

    if (same) {
      // Keep earliest start_date
      const curStart = current.start_date as number | undefined;
      const nextStart = next.start_date as number | undefined;
      if (
        typeof curStart === "number" &&
        typeof nextStart === "number" &&
        nextStart < curStart
      ) {
        current.start_date = nextStart;
      }

      // Extend end_date to the later one
      const curEnd = current.end_date as number | undefined;
      const nextEnd = next.end_date as number | undefined;
      if (
        typeof curEnd === "number" &&
        typeof nextEnd === "number" &&
        nextEnd > curEnd
      ) {
        current.end_date = nextEnd;
      } else if (typeof curEnd !== "number") {
        // If current has no end_date but next does, adopt it
        current.end_date = next.end_date;
      }
      // Do not push next; it is merged into current
    } else {
      merged.push(current);
      current = structuredClone(next);
    }
  }

  merged.push(current);
  return merged;
};
