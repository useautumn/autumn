import { z } from "zod/v4";

/** Input a newer writer produced that this build does not know: carried or skipped, never refused. */
export type UnknownInput =
	| { kind: "enum_value"; schema: string; value: string }
	| {
			kind: "row_change";
			table: string;
			op: string;
			commandId: string;
			identity: unknown;
	  }
	| { kind: "row_column"; table: string; column: string };

type UnknownInputListener = (input: UnknownInput) => void;

const sighted = new Set<string>();
let listener: UnknownInputListener = () => {};

/** Where the first sighting of each unknown input goes; a process installs its logger once at boot. */
export const onUnknownInput = (next: UnknownInputListener): void => {
	listener = next;
};

/** Reports an unknown input once per process per key, so a rollout is visible without a line per read. */
export const sightUnknownInput = ({
	key,
	input,
}: {
	key: string;
	input: UnknownInput;
}): void => {
	if (sighted.has(key)) return;
	sighted.add(key);
	try {
		listener(input);
	} catch {}
};

/** An enum whose values grow: any string parses, typed as the values this build branches on. */
export const openEnum = <Value extends string>({
	name,
	values,
}: {
	name: string;
	values: readonly Value[];
}): z.ZodType<Value> => {
	const known = new Set<string>(values);
	return z.custom<Value>(
		(value) => {
			if (typeof value !== "string") return false;
			if (!known.has(value))
				sightUnknownInput({
					key: `${name}=${value}`,
					input: { kind: "enum_value", schema: name, value },
				});
			return true;
		},
		{ message: `${name} must be a string` },
	);
};

type AnyDef = z.core.$ZodTypeDef & Record<string, unknown>;

function openChild(child: unknown, path: string): unknown {
	return child instanceof z.ZodType ? open({ schema: child, path }) : child;
}

/** The same schema with every object loose and every enum open, so a shared row schema reads a newer build's columns and values. */
function open({
	schema,
	path,
}: {
	schema: z.ZodType;
	path: string;
}): z.ZodType {
	const def = schema._zod.def as AnyDef;
	const clone = (patch: Record<string, unknown>) =>
		z.clone(schema, { ...def, ...patch } as typeof schema._zod.def);
	switch (def.type) {
		case "object": {
			const shape = Object.fromEntries(
				Object.entries(def.shape as Record<string, z.ZodType>).map(
					([key, child]) => [
						key,
						open({ schema: child, path: `${path}.${key}` }),
					],
				),
			);
			return clone({ shape, catchall: z.unknown() });
		}
		case "enum": {
			const values = Object.values(def.entries as Record<string, unknown>);
			if (!values.every((value) => typeof value === "string")) return schema;
			return openEnum({ name: path, values });
		}
		case "array":
			return clone({ element: openChild(def.element, `${path}[]`) });
		case "record":
		case "map":
		case "set":
			return clone({ valueType: openChild(def.valueType, `${path}{}`) });
		case "union":
			return clone({
				options: (def.options as z.ZodType[]).map((option, index) =>
					open({ schema: option, path: `${path}|${index}` }),
				),
			});
		case "intersection":
			return clone({
				left: openChild(def.left, path),
				right: openChild(def.right, path),
			});
		case "tuple":
			return clone({
				items: (def.items as z.ZodType[]).map((item, index) =>
					open({ schema: item, path: `${path}[${index}]` }),
				),
				rest: openChild(def.rest, `${path}[]`),
			});
		case "optional":
		case "nullable":
		case "nonoptional":
		case "readonly":
		case "default":
		case "prefault":
		case "catch":
		case "promise":
		case "success":
			return clone({ innerType: openChild(def.innerType, path) });
		case "pipe":
			return clone({
				in: openChild(def.in, path),
				out: openChild(def.out, path),
			});
		case "lazy": {
			const getter = def.getter as () => z.ZodType;
			return clone({ getter: () => open({ schema: getter(), path }) });
		}
		default:
			return schema;
	}
}

export const openSchema = <Schema extends z.ZodType>({
	name,
	schema,
}: {
	name: string;
	schema: Schema;
}): Schema => open({ schema, path: name }) as Schema;
