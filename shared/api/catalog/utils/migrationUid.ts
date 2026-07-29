/** Short, low-collision suffix for generated migration ids. */
export const migrationUid = (): string => Date.now().toString(36).slice(-3);
