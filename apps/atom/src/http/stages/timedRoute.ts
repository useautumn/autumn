import type { Context, Next } from "hono";
import { timeStage } from "../../threads/stats/stageClock.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

type Route = (context: Context<AtomHttpEnv>, next: Next) => unknown;

/** A middleware or handler whose synchronous work, up to its first await, counts as honoRoute. */
export const timedRoute =
	<R extends Route>(route: R) =>
	(context: Context<AtomHttpEnv>, next: Next) =>
		timeStage("honoRoute", () => route(context, next)) as ReturnType<R>;
