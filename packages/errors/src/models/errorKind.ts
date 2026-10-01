/**
 * `expected`: thrown on purpose for the caller. `infra`: a dependency failed transiently; alert on its rate.
 * `bug`: someone needs to fix code.
 */
export type ErrorKind = "expected" | "infra" | "bug";
