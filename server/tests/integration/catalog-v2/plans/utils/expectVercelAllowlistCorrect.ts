import { expect } from "bun:test";

export const expectVercelAllowlistRewritten = ({
	allowlist,
	oldId,
	newId,
}: {
	allowlist: string[] | undefined;
	oldId: string;
	newId: string;
}) => {
	expect(allowlist).toContain(newId);
	expect(allowlist).not.toContain(oldId);
};

export const expectVercelBillingPlansListed = ({
	listedIds,
	oldId,
	newId,
}: {
	listedIds: string[];
	oldId: string;
	newId: string;
}) => {
	expect(listedIds).toContain(newId);
	expect(listedIds).not.toContain(oldId);
};
