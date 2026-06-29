/**
 * Resolves the scope grant for a user within the given organisation.
 *
 * The implementation now lives in `@autumn/shared` so the dashboard session and
 * the Slack bot (leaf) share one source of truth and can never drift on the
 * role -> scope mapping. Re-exported here so existing server import sites keep
 * working unchanged.
 */
export { getScopesForUserInOrg } from "@autumn/shared";
