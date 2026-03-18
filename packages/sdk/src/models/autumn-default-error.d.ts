import { AutumnError } from "./autumn-error.js";
/** The fallback error class if no more specific error class is matched */
export declare class AutumnDefaultError extends AutumnError {
    constructor(message: string, httpMeta: {
        response: Response;
        request: Request;
        body: string;
    });
}
