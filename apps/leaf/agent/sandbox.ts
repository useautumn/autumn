import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

export default defineSandbox({
	backend: justbash(),
	description:
		"Lightweight local sandbox for Leaf. Shell, file, and web tools are disabled; this avoids Docker startup in local dashboard chat.",
});
