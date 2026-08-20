import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

/** Shell, file, and web tools are disabled everywhere, so justbash avoids
 * Docker startup without giving anything up. */
export const leafSandbox = ({ description }: { description: string }) =>
	defineSandbox({ backend: justbash(), description });
