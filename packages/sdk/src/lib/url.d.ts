export type Params = Partial<Record<string, string | number>>;
export declare function pathToFunc(pathPattern: string, options?: {
    charEncoding?: "percent" | "none";
}): (params?: Params) => string;
