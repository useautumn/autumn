import * as z from "zod/v4-mini";
export declare function bytesToBase64(u8arr: Uint8Array): string;
export declare function bytesFromBase64(encoded: string): Uint8Array;
export declare function stringToBytes(str: string): Uint8Array;
export declare function stringFromBytes(u8arr: Uint8Array): string;
export declare function stringToBase64(str: string): string;
export declare function stringFromBase64(b64str: string): string;
export declare const zodOutbound: z.ZodMiniUnion<readonly [z.ZodMiniCustom<Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>>, z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<Uint8Array<ArrayBufferLike>, string>>]>;
export declare const zodInbound: z.ZodMiniUnion<readonly [z.ZodMiniCustom<Uint8Array<ArrayBufferLike>, Uint8Array<ArrayBufferLike>>, z.ZodMiniPipe<z.ZodMiniString<string>, z.ZodMiniTransform<Uint8Array<ArrayBufferLike>, string>>]>;
