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

// Merge adjacent phases that have identical items
export const mergeAdjacentPhasesWithSameItems = (
  phases: Stripe.SubscriptionScheduleUpdateParams.Phase[]
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
  if (!phases || phases.length <= 1) return phases;

  const merged: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];
  let current = structuredClone(phases[0]);

  for (let i = 1; i < phases.length; i++) {
    const next = phases[i];
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
