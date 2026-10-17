export const describeHasPaid = ({ hasPaid }: { hasPaid: boolean }) =>
	hasPaid ? "has paid before" : "never paid";
