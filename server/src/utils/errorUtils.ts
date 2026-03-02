import chalk from "chalk";

export default class RecaseError extends Error {
	code: string;
	data: any;
	statusCode: number;

	constructor({
		message,
		code,
		data,
		statusCode = 400,
	}: {
		message: string;
		code: string;
		data?: any;
		statusCode?: number;
	}) {
		super(message);
		this.name = "RecaseError";
		this.code = code;
		this.data = data;
		this.statusCode = statusCode;
	}

	print(logger: any) {
		logger.warn(`Code:    ${chalk.yellow(this.code)}`);
		logger.warn(`Message: ${chalk.yellow(this.message)}`);

		if (this.data) {
			logger.warn(`Data:`);
			logger.warn(this.data);
		} else {
			logger.warn("No data");
		}
	}
}
