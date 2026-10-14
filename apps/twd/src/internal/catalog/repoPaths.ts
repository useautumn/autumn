import { relative, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dir, "../../../../..");
export const TESTS_DIR = resolve(REPO_ROOT, "server/tests");

export const toTestId = ({ absolutePath }: { absolutePath: string }) =>
	relative(TESTS_DIR, absolutePath);
export const isArchivedTestId = ({ testId }: { testId: string }) =>
	testId === "archives" || testId.startsWith("archives/");

export const UNIT_GROUP = "unit";
export const groupSelectsTestId = ({
	group,
	testId,
}: {
	group: string;
	testId: string;
}) => group === UNIT_GROUP || !testId.startsWith("unit/");

export const toAbsoluteTestPath = ({ testId }: { testId: string }) =>
	resolve(TESTS_DIR, testId);
