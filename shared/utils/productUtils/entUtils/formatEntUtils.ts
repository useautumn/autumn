import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";

export const formatEnt = ({ ent }: { ent: Entitlement }) => {
	return `${ent.feature_id} [Allowance: ${ent.allowance}, Interval: ${ent.interval}]`;
};

export const logEnts = ({
	ents,
	prefix,
}: {
	ents: Entitlement[];
	prefix?: string;
}) => {
	console.log("--------------------------------");
	if (prefix) {
		console.log(`${prefix}:`);
	}
	for (const ent of ents) {
		console.log(`${ent.id} - ${formatEnt({ ent })}`);
	}
	console.log("--------------------------------");
};
