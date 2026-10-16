/** Rules load their subjects in the same statement, so a concurrent save can't tear the read. */
export const subjectColumns = { subject_type: true, subject_id: true } as const;
