type FireLensOutput = {
	write: (chunk: string) => unknown;
};

export const writeFireLensRecord = ({
	record,
	output = process.stdout,
}: {
	record: unknown;
	output?: FireLensOutput;
}) => {
	output.write(`${JSON.stringify(record)}\n`);
};
