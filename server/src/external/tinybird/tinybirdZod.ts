import { z } from "zod";

// @chronark/zod-bird validates with its own plain `zod` import at runtime,
// so Tinybird schemas need to use the same schema implementation.
export { z };
