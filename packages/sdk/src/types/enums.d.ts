import * as z from "zod/v4-mini";
import { Unrecognized } from "./unrecognized.js";
export type ClosedEnum<T extends Readonly<Record<string, string | number>>> = T[keyof T];
export type OpenEnum<T extends Readonly<Record<string, string | number>>> = T[keyof T] | Unrecognized<T[keyof T] extends number ? number : string>;
export declare function inboundSchema<T extends Record<string, string>>(enumObj: T): z.ZodMiniType<OpenEnum<T>, unknown>;
export declare function inboundSchemaInt<T extends Record<string, number | string>>(enumObj: T): z.ZodMiniType<OpenEnum<T>, unknown>;
export declare function outboundSchema<T extends Record<string, string>>(_: T): z.ZodMiniType<string, OpenEnum<T>>;
export declare function outboundSchemaInt<T extends Record<string, number | string>>(_: T): z.ZodMiniType<number, OpenEnum<T>>;
