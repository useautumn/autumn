import { HTTPClient } from "./http.js";
import { Logger } from "./logger.js";
import { RetryConfig } from "./retries.js";
/**
 * Contains the list of servers available to the SDK
 */
export declare const ServerList: readonly ["https://api.useautumn.com"];
export type SDKOptions = {
    secretKey?: string | (() => Promise<string>) | undefined;
    /**
     * Allows setting the xApiVersion parameter for all supported operations
     */
    xApiVersion?: string | undefined;
    httpClient?: HTTPClient;
    /**
     * Allows overriding the default server used by the SDK
     */
    serverIdx?: number | undefined;
    /**
     * Allows overriding the default server URL used by the SDK
     */
    serverURL?: string | undefined;
    /**
     * Allows overriding the default user agent used by the SDK
     */
    userAgent?: string | undefined;
    /**
     * Allows overriding the default retry config used by the SDK
     */
    retryConfig?: RetryConfig;
    timeoutMs?: number;
    debugLogger?: Logger;
};
export declare function serverURLFromOptions(options: SDKOptions): URL | null;
export declare const SDK_METADATA: {
    readonly language: "typescript";
    readonly openapiDocVersion: "2.2.0";
    readonly sdkVersion: "0.10.17";
    readonly genVersion: "2.866.2";
    readonly userAgent: "speakeasy-sdk/typescript 0.10.17 2.866.2 2.2.0 @useautumn/sdk";
};
