import chalk from "chalk";

export const colorize = (text: string, chalkColor: any) => {
  return `${chalkColor}${text}${chalk.reset}`;
};
