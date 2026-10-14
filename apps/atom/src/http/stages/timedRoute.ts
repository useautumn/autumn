import type { Context, Next } from "hono";
import { type Stage, timeStage } from "../../threads/stats/stageClock.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

type Route = (context: Context<AtomHttpEnv>, next: Next) => unknown;

/** A middleware or handler whose synchronous work, up to its first await, counts as honoRoute. */
export const timedRoute =
	<R extends Route>(route: R, stage: Stage = "honoRoute") =>
	(context: Context<AtomHttpEnv>, next: Next) =>
		timeStage(stage, () => route(context, next)) as ReturnType<R>;
