import { useEffect, useState } from "react";
import { CreateItemStep } from "./utils/CreateItemStep";

export const useSteps = ({ initialStep }: { initialStep: CreateItemStep }) => {
  const [stepVal, setStepVal] = useState(initialStep);
  const [stepStack, setStepStack] = useState<CreateItemStep[]>([initialStep]);

  // useEffect(() => {
  //   setStepStack([initialStep]);
  //   setStepVal(initialStep);
  // }, []);

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

  const pushStep = (step: CreateItemStep) => {
    console.log("Pushing step!", step);
    setStepStack((prev) => [...prev, step]);
    setStepVal(step);
  };

  const resetSteps = () => {
    setStepStack([initialStep]);
    setStepVal(initialStep);
  };

  const replaceStep = (step: CreateItemStep) => {
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
  };
};
