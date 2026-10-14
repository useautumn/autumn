import { TABLE_TRANSITION } from "@autumn/ui/components/table/table-motion";
import { useReducedMotion } from "motion/react";

const INSTANT = { duration: 0 } as const;

export const useFadeTransition = () =>
	useReducedMotion() ? INSTANT : TABLE_TRANSITION;
