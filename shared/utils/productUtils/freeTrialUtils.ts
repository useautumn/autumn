import type {
	CreateFreeTrial,
	FreeTrial,
} from "../../models/productModels/freeTrialModels/freeTrialModels.js";

export const freeTrialsAreSame = ({
	ft1,
	ft2,
}: {
	ft1?: FreeTrial | CreateFreeTrial | null;
	ft2?: FreeTrial | CreateFreeTrial | null;
}) => {
	if (!ft1 && !ft2) return true;
	if (!ft1 || !ft2) return false;

	const diffs = {
		length: {
			condition: ft1.length !== ft2.length,
			message: `Length different: ${ft1.length} !== ${ft2.length}`,
		},
		unique_fingerprint: {
			condition: ft1.unique_fingerprint !== ft2.unique_fingerprint,
			message: `Unique fingerprint different: ${ft1.unique_fingerprint} !== ${ft2.unique_fingerprint}`,
		},
		duration: {
			condition: ft1.duration !== ft2.duration,
			message: `Duration different: ${ft1.duration} !== ${ft2.duration}`,
		},
		card_required: {
			condition: ft1.card_required !== ft2.card_required,
			message: `Card required different: ${ft1.card_required} !== ${ft2.card_required}`,
		},
	};

	const freeTrialsAreDiff = Object.values(diffs).some((d) => d.condition);

	if (freeTrialsAreDiff) {
		console.log("Free trials different");
		console.log(
			"Differences:",
			Object.values(diffs)
				.filter((d) => d.condition)
				.map((d) => d.message),
		);
	}
	return !freeTrialsAreDiff;
};
