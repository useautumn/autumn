import type { Product } from "../../../models/productModels/productModels.js";

const additionalIdsAreSame = ({
	left,
	right,
}: {
	left?: string[];
	right?: string[];
}): boolean => {
	const leftIds = [...(left ?? [])].sort();
	const rightIds = [...(right ?? [])].sort();
	return (
		leftIds.length === rightIds.length &&
		leftIds.every((id, index) => id === rightIds[index])
	);
};

export const productProcessorsAreSame = ({
	left,
	right,
}: {
	left: Product["processor"];
	right: Product["processor"];
}): boolean =>
	(left?.id ?? null) === (right?.id ?? null) &&
	additionalIdsAreSame({
		left: left?.additional_ids,
		right: right?.additional_ids,
	});
