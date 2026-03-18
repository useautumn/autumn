import { type Unrecognized } from "./unrecognized.js";
export declare function defaultToZeroValue<T>(value: T): Unrecognized<T>;
export declare function startCountingDefaultToZeroValue(): {
    /**
     * Ends counting and returns the delta.
     * @param delta - If provided, only this amount is added to the parent counter
     *   (used for nested unions where we only want to record the winning option's count).
     *   If not provided, records all counts since start().
     */
    end: (delta?: number) => number;
};
