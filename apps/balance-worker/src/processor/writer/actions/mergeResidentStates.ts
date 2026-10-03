import { mergeSubjectStates, type SubjectState } from "@autumn/balance-engine";

const mergedByCustomer = new WeakMap<
	SubjectState,
	WeakMap<SubjectState, SubjectState>
>();

/** An entity's view over its customer, built once per (customer, entity) state pair: both are replaced
 *  on write, never edited, so every cache keyed on the view keeps hitting until one of them changes. */
export const mergeResidentStates = ({
	customer,
	entity,
}: {
	customer: SubjectState;
	entity: SubjectState | null;
}): SubjectState => {
	if (!entity) return customer;
	let mergedByEntity = mergedByCustomer.get(customer);
	if (!mergedByEntity) {
		mergedByEntity = new WeakMap();
		mergedByCustomer.set(customer, mergedByEntity);
	}
	const known = mergedByEntity.get(entity);
	if (known) return known;
	const merged = mergeSubjectStates({ customer, entity });
	mergedByEntity.set(entity, merged);
	return merged;
};
