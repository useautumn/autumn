import { relative, resolve } from "node:path";

/** twd runs from the monorepo checkout; test discovery reads its server/tests tree. */
export const REPO_ROOT = resolve(import.meta.dir, "../../../../..");
export const TESTS_DIR = resolve(REPO_ROOT, "server/tests");

/** Contract file ids are server/tests-relative (`integration/billing/attach.test.ts`). */
export const toTestId = ({ absolutePath }: { absolutePath: string }) =>
	relative(TESTS_DIR, absolutePath);
/** server/tests/archives holds retired tests; they never enter the catalog or a run. */
export const isArchivedTestId = ({ testId }: { testId: string }) =>
	testId === "archives" || testId.startsWith("archives/");

export const UNIT_GROUP = "unit";
/** CI runs unit tests on every PR and each would boot its own twd sandbox, so only the unit group or an explicit path selects them. */
export const groupSelectsTestId = ({
	group,
	testId,
}: {
	group: string;
	testId: string;
}) => group === UNIT_GROUP || !testId.startsWith("unit/");

export const toAbsoluteTestPath = ({ testId }: { testId: string }) =>
	resolve(TESTS_DIR, testId);
