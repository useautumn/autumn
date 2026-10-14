// Alternative: Use pino without worker thread transport
const getTime = () => {
	const timeString = new Date().toISOString();
	return `[${timeString.split("T")[1].split(".")[0]}]`;
};

const greaterThanLevel = (level: string) => {
	return levels.indexOf(level) >= levels.indexOf(logger.level);
};

const levels = ["debug", "info", "warn", "error", "fatal"];

export const logger = {
	...console,
	level: "info",
	debug: (...args: any[]) => {
		if (greaterThanLevel("debug")) {
			console.log(getTime(), "DEBUG", ...args);
		}
	},
	log: (...args: any[]) => {
		console.log(getTime(), "INFO", ...args);
	},
	info: (...args: any[]) => {
		if (greaterThanLevel("info")) {
			console.log(getTime(), "INFO", ...args);
		}
	},
	warn: (...args: any[]) => {
		if (greaterThanLevel("warn")) {
			console.log(getTime(), "WARN", ...args);
		}
	},
	error: (...args: any[]) => {
		if (greaterThanLevel("error")) {
			console.log(getTime(), "ERROR", ...args);
		}
	},
};
