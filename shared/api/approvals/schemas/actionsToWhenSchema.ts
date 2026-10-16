import type { z } from "zod/v4";
import { ACTIONS, type ApprovalAction } from "../actions/approvalActions";
import { buildWhenSchema } from "./when/buildWhenSchema";
import { WHEN_SHAPES, type WhenKey } from "./when/whenSchemas";

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
 * The `when` schema a rule on these actions may use, or null when it can't
 * have conditions. Mixed actions only get the fields every one of them has.
 */
export const actionsToWhenSchema = ({
	actions,
}: {
	actions: ApprovalAction[];
}) => {
	const whenKeys = [...new Set(actions.map((action) => ACTIONS[action].when))];
	const shapeKeys = whenKeys.filter((key): key is WhenKey => key !== null);
	const hasWhoOnlyAction = shapeKeys.length < whenKeys.length;
	if (shapeKeys.length === 0 || hasWhoOnlyAction) return null;

	const shape = fieldsSharedByAll({
		shapes: shapeKeys.map((key) => WHEN_SHAPES[key]),
	});
	if (Object.keys(shape).length === 0) return null;

	return buildWhenSchema({ shape });
};
