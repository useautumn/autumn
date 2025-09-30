import { useState } from "react";
import type { CreateItemStep } from "./utils/CreateItemStep";

export const useSteps = <T = CreateItemStep>({
	initialStep,
}: {
	initialStep: T;
}) => {
	const [stepVal, setStepVal] = useState(initialStep);
	const [stepStack, setStepStack] = useState<T[]>([initialStep]);

	const popStep = () => {
		if (stepStack.length === 1) {
			return;
		}

		setStepStack((prev) => {
			const newStack = prev.slice(0, -1);
			const newStep = newStack[newStack.length - 1];
			setStepVal(newStep);
			return newStack;
		});
	};

	const pushStep = (step: T) => {
		setStepStack((prev) => [...prev, step]);
		setStepVal(step);
	};

	const resetSteps = () => {
		setStepStack([initialStep]);
		setStepVal(initialStep);
	};

	const replaceStep = (step: T) => {
		const curStack = stepStack;
		if (curStack.length <= 1) {
			setStepStack([step]);
			setStepVal(step);
		} else {
			setStepStack((prev) => [...prev.slice(0, -1), step]);
			setStepVal(step);
		}
	};

	return {
		stepVal,
		popStep,
		pushStep,
		resetSteps,
		replaceStep,
		previousStep: stepStack.length > 1 ? stepStack[stepStack.length - 2] : null,
		stepCount: stepStack.length,
	};
};
