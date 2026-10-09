import { TABLE_TRANSITION } from "@autumn/ui/components/table/table-motion";
import { useReducedMotion } from "motion/react";

const INSTANT = { duration: 0 } as const;

/** The usage page's one opacity fade; instant when the user prefers reduced motion. */
export const useFadeTransition = () =>
	useReducedMotion() ? INSTANT : TABLE_TRANSITION;
