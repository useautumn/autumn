import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

export const leafSandbox = ({ description }: { description: string }) =>
	defineSandbox({ backend: justbash(), description });
