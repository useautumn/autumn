import { verification } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import {
	type AgentClaimAttempt,
	AgentClaimPurpose,
	getAgentClaimAttemptIdentifier,
	getAgentClaimPointerIdentifier,
} from "../agentAuthUtils.js";

const AgentClaimAttemptSchema = z.object({
	version: z.literal(1),
	purpose: z.literal(AgentClaimPurpose.Claim),
	email: z.email(),
	claimTokenHash: z.string().length(64),
	attemptTokenHash: z.string().length(64),
	expiresAt: z.iso.datetime(),
});

export const parseAgentClaimAttempt = ({
	value,
}: {
	value: string;
}): AgentClaimAttempt | null => {
	try {
		const parsed = AgentClaimAttemptSchema.safeParse(JSON.parse(value));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
};

const findStoredAttemptTokenHash = async ({
	db,
	claimTokenHash,
}: {
	db: DrizzleCli;
	claimTokenHash: string;
}): Promise<string | null> => {
	const pointer = await db.query.verification.findFirst({
		where: eq(
			verification.identifier,
			getAgentClaimPointerIdentifier({ claimTokenHash }),
		),
	});
	return pointer?.value ?? null;
};

export const createAgentClaimAttempt = async ({
	db,
	attempt,
}: {
	db: DrizzleCli;
	attempt: AgentClaimAttempt;
}) => {
	const expiresAt = new Date(attempt.expiresAt);
	await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${attempt.claimTokenHash}))`,
		);
		const transactionDb = tx as unknown as DrizzleCli;
		const previousAttemptTokenHash = await findStoredAttemptTokenHash({
			db: transactionDb,
			claimTokenHash: attempt.claimTokenHash,
		});
		if (previousAttemptTokenHash) {
			await tx.delete(verification).where(
				eq(
					verification.identifier,
					getAgentClaimAttemptIdentifier({
						attemptTokenHash: previousAttemptTokenHash,
					}),
				),
			);
		}
		await tx.delete(verification).where(
			eq(
				verification.identifier,
				getAgentClaimPointerIdentifier({
					claimTokenHash: attempt.claimTokenHash,
				}),
			),
		);
		await tx.insert(verification).values([
			{
				id: generateId("verification"),
				identifier: getAgentClaimAttemptIdentifier({
					attemptTokenHash: attempt.attemptTokenHash,
				}),
				value: JSON.stringify(attempt),
				expiresAt,
			},
			{
				id: generateId("verification"),
				identifier: getAgentClaimPointerIdentifier({
					claimTokenHash: attempt.claimTokenHash,
				}),
				value: attempt.attemptTokenHash,
				expiresAt,
			},
		]);
	});
};

export const findAgentClaimAttempt = async ({
	db,
	attemptTokenHash,
}: {
	db: DrizzleCli;
	attemptTokenHash: string;
}): Promise<AgentClaimAttempt | null> => {
	const stored = await db.query.verification.findFirst({
		where: eq(
			verification.identifier,
			getAgentClaimAttemptIdentifier({ attemptTokenHash }),
		),
	});
	return stored ? parseAgentClaimAttempt({ value: stored.value }) : null;
};

export const consumeAgentClaimAttempt = async ({
	db,
	attemptTokenHash,
}: {
	db: Pick<DrizzleCli, "delete">;
	attemptTokenHash: string;
}): Promise<AgentClaimAttempt | null> => {
	const [stored] = await db
		.delete(verification)
		.where(
			eq(
				verification.identifier,
				getAgentClaimAttemptIdentifier({ attemptTokenHash }),
			),
		)
		.returning({ value: verification.value });
	return stored ? parseAgentClaimAttempt({ value: stored.value }) : null;
};

export const deleteAgentClaimAttemptPointer = async ({
	db,
	claimTokenHash,
}: {
	db: Pick<DrizzleCli, "delete">;
	claimTokenHash: string;
}) =>
	db
		.delete(verification)
		.where(
			eq(
				verification.identifier,
				getAgentClaimPointerIdentifier({ claimTokenHash }),
			),
		);
