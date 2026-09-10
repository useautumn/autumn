/**
 * The skills the CLI carries, by agent-docs entry name. An allowlist rather
 * than "everything agent-docs exports": Leaf's operational skills (billing,
 * investigate, …) are not what a repo modelling its pricing needs.
 *
 * Entries land when their skill exists in agent-docs: a name here without a
 * generated skill fails `bun generate`, so the list cannot go stale silently.
 */
export const SKILL_ALLOWLIST: readonly string[] = [
	"autumn-setup",
	"autumn-catalog",
	"autumn-integrate",
	"autumn-concepts",
];
