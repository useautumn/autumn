import * as z from "zod/v4-mini";
export declare const blobLikeSchema: z.ZodMiniType<Blob, Blob>;
export declare function isBlobLike(val: unknown): val is Blob;
