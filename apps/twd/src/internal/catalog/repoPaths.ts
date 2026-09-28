import { relative, resolve } from "node:path";

/** twd runs from the monorepo checkout; test discovery reads its server/tests tree. */
export const REPO_ROOT = resolve(import.meta.dir, "../../../../..");
export const TESTS_DIR = resolve(REPO_ROOT, "server/tests");

/** Contract file ids are server/tests-relative (`integration/billing/attach.test.ts`). */
export const toTestId = ({ absolutePath }: { absolutePath: string }) =>
	relative(TESTS_DIR, absolutePath);
export const toAbsoluteTestPath = ({ testId }: { testId: string }) =>
	resolve(TESTS_DIR, testId);
