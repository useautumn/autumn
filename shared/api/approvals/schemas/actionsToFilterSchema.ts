import type { z } from "zod/v4";
import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import {
	APPROVAL_FILTER_SHAPES,
	type ApprovalFilterKey,
} from "./filters/approvalFilterShapes";
import { buildFilterSchema } from "./filters/buildFilterSchema";

const fieldsSharedByAll = ({
	shapes,
}: {
	shapes: z.ZodRawShape[];
}): z.ZodRawShape => {
	const [first, ...rest] = shapes;
	return Object.fromEntries(
		Object.entries(first).filter(([key, field]) =>
			rest.every((shape) => shape[key] === field),
		),
	);
};

/**
 * The filter schema a rule on these actions may use, or null when it can't
 * have conditions. Mixed actions only get the fields every one of them has.
 */
export const actionsToFilterSchema = ({
	actions,
}: {
	actions: ApprovalAction[];
}) => {
	const filterKeys = [
		...new Set(actions.map((action) => ACTIONS[action].filter)),
	];
	const shapeKeys = filterKeys.filter(
		(key): key is ApprovalFilterKey => key !== null,
	);
	const hasWhoOnlyAction = shapeKeys.length < filterKeys.length;
	if (shapeKeys.length === 0 || hasWhoOnlyAction) return null;

	const shape = fieldsSharedByAll({
		shapes: shapeKeys.map((key) => APPROVAL_FILTER_SHAPES[key]),
	});
	if (Object.keys(shape).length === 0) return null;

	return buildFilterSchema({ shape });
};
