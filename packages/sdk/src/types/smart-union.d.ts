import * as z from "zod/v4-mini";
/**
 * Smart union parser that tries all schemas and returns the best match
 * based on the number of populated fields.
 */
export declare function smartUnion<Options extends readonly [z.ZodMiniType, z.ZodMiniType, ...z.ZodMiniType[]]>(options: Options): z.ZodMiniType<z.output<Options[number]>, z.input<Options[number]>>;
