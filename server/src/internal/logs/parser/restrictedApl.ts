import {
	DEFAULT_RESTRICTED_APL_STAGES,
	RESTRICTED_APL_DANGEROUS_TEXT_PATTERNS,
	RESTRICTED_APL_FIELD_ALIASES,
	RESTRICTED_APL_MAX_LIMIT,
	RESTRICTED_APL_MAX_NESTED_PATH_DEPTH,
	RESTRICTED_APL_NESTED_ROOTS,
	RESTRICTED_APL_NUMERIC_AGGREGATE_FIELDS,
	RESTRICTED_APL_TOP_LEVEL_FIELDS,
	type RestrictedAplNestedRoot,
	type RestrictedAplStageKind,
	type RestrictedAplTopLevelField,
	SAFE_APL_IDENTIFIER,
} from "./restrictedAplConfig.js";

export type RestrictedAplField =
	| {
			kind: "topLevel";
			name: RestrictedAplTopLevelField;
	  }
	| {
			kind: "nested";
			root: RestrictedAplNestedRoot;
			path: string[];
	  };

export type LiteralValue = string | number | boolean | null;

export type CompareOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export type RestrictedAplExpr =
	| {
			kind: "comparison";
			field: RestrictedAplField;
			op: CompareOperator;
			value: LiteralValue;
	  }
	| {
			kind: "stringMatch";
			field: RestrictedAplField;
			op: "contains" | "startswith";
			value: string;
	  }
	| {
			kind: "in";
			field: RestrictedAplField;
			values: LiteralValue[];
	  }
	| {
			kind: "and" | "or";
			left: RestrictedAplExpr;
			right: RestrictedAplExpr;
	  };

export type SummarizeFunction =
	| { kind: "count" }
	| { kind: "countif"; expr: RestrictedAplExpr }
	| {
			kind: "numeric";
			name: "avg" | "sum" | "min" | "max";
			field: RestrictedAplField;
	  }
	| {
			kind: "percentile";
			field: RestrictedAplField;
			percentile: number;
	  };

export type SummarizeAggregation = {
	alias: string;
	fn: SummarizeFunction;
};

export type AplReference =
	| {
			kind: "field";
			field: RestrictedAplField;
	  }
	| {
			kind: "identifier";
			name: string;
	  };

export type ProjectColumn = {
	source: AplReference;
	alias?: string;
};

export type RestrictedAplStage =
	| { kind: "where"; expr: RestrictedAplExpr }
	| {
			kind: "orderBy";
			target: AplReference;
			direction: "asc" | "desc";
	  }
	| { kind: "limit"; value: number }
	| {
			kind: "summarize";
			aggregations: SummarizeAggregation[];
			by: RestrictedAplField[];
	  }
	| {
			kind: "project";
			columns: ProjectColumn[];
	  };

export type RestrictedAplAst = {
	stages: RestrictedAplStage[];
};

type Token =
	| { kind: "identifier"; value: string }
	| { kind: "string"; value: string }
	| { kind: "number"; value: number }
	| {
			kind: "symbol";
			value:
				| "|"
				| "("
				| ")"
				| ","
				| "="
				| "=="
				| "!="
				| ">"
				| ">="
				| "<"
				| "<=";
	  };

type SymbolValue = Extract<Token, { kind: "symbol" }>["value"];

const textDecoder = (value: string) =>
	value.replace(/\\'/g, "'").replace(/\\\\/g, "\\");

const assertNoDangerousText = (query: string) => {
	for (const { pattern, message } of RESTRICTED_APL_DANGEROUS_TEXT_PATTERNS) {
		if (pattern.test(query)) throw new Error(message);
	}
};

const tokenize = (query: string): Token[] => {
	assertNoDangerousText(query);

	const tokens: Token[] = [];
	let i = 0;

	while (i < query.length) {
		const char = query[i];

		if (/\s/.test(char)) {
			i++;
			continue;
		}

		if (char === "|") {
			tokens.push({ kind: "symbol", value: "|" });
			i++;
			continue;
		}

		if (char === "(" || char === ")" || char === ",") {
			tokens.push({ kind: "symbol", value: char });
			i++;
			continue;
		}

		const two = query.slice(i, i + 2);
		if (two === "==" || two === "!=" || two === ">=" || two === "<=") {
			tokens.push({ kind: "symbol", value: two });
			i += 2;
			continue;
		}

		if (char === ">" || char === "<") {
			tokens.push({ kind: "symbol", value: char });
			i++;
			continue;
		}

		if (char === "=") {
			tokens.push({ kind: "symbol", value: "=" });
			i++;
			continue;
		}

		if (char === "'") {
			let j = i + 1;
			let raw = "";
			while (j < query.length) {
				const current = query[j];
				if (current === "\\") {
					const next = query[j + 1];
					if (next !== "\\" && next !== "'") {
						throw new Error(
							"Only escaped quotes and backslashes are supported",
						);
					}
					raw += current + next;
					j += 2;
					continue;
				}
				if (current === "'") break;
				raw += current;
				j++;
			}
			if (j >= query.length || query[j] !== "'") {
				throw new Error("Unterminated string literal");
			}
			tokens.push({ kind: "string", value: textDecoder(raw) });
			i = j + 1;
			continue;
		}

		if (/[0-9-]/.test(char)) {
			const match = query.slice(i).match(/^-?\d+(?:\.\d+)?/);
			if (!match) throw new Error("Invalid number literal");
			tokens.push({ kind: "number", value: Number(match[0]) });
			i += match[0].length;
			continue;
		}

		if (/[A-Za-z_]/.test(char)) {
			const match = query.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
			if (!match) throw new Error("Invalid identifier");
			tokens.push({ kind: "identifier", value: match[0] });
			i += match[0].length;
			continue;
		}

		throw new Error(`Unsupported query character: ${char}`);
	}

	return tokens;
};

const NESTED_ROOT_NAMES = Object.keys(
	RESTRICTED_APL_NESTED_ROOTS,
) as RestrictedAplNestedRoot[];

const isNestedRoot = (value: string): value is RestrictedAplNestedRoot =>
	NESTED_ROOT_NAMES.includes(value as RestrictedAplNestedRoot);

const fieldDisplayName = (field: RestrictedAplField): string =>
	field.kind === "topLevel"
		? field.name
		: `${field.root}.${field.path.join(".")}`;

const resolveFieldIdentifier = (raw: string): RestrictedAplField | null => {
	const topLevel = RESTRICTED_APL_FIELD_ALIASES[raw];
	if (topLevel) return { kind: "topLevel", name: topLevel };

	const [root, ...path] = raw.split(".");
	if (!isNestedRoot(root)) return null;

	if (path.length === 0 || path.length > RESTRICTED_APL_MAX_NESTED_PATH_DEPTH) {
		throw new Error(
			`Nested query field must have 1-${RESTRICTED_APL_MAX_NESTED_PATH_DEPTH} path segments: ${raw}`,
		);
	}

	for (const segment of path) {
		if (!SAFE_APL_IDENTIFIER.test(segment)) {
			throw new Error(`Unsafe nested query field segment: ${segment}`);
		}
	}

	return { kind: "nested", root, path };
};

class Parser {
	private index = 0;

	constructor(private readonly tokens: Token[]) {}

	parse(): RestrictedAplAst {
		const stages: RestrictedAplStage[] = [];

		this.consumePipeIfPresent();
		while (!this.isDone()) {
			stages.push(this.parseStage());
			if (this.isDone()) break;
			this.expectSymbol("|");
		}

		return { stages };
	}

	private parseStage(): RestrictedAplStage {
		const keyword = this.expectIdentifier().toLowerCase();
		switch (keyword) {
			case "where":
				return { kind: "where", expr: this.parseOrExpr() };
			case "order": {
				this.expectKeyword("by");
				const target = this.expectSafeIdentifierOrField();
				const direction = this.peekIdentifierLower();
				if (direction === "asc" || direction === "desc") {
					this.index++;
					return { kind: "orderBy", target, direction };
				}
				return { kind: "orderBy", target, direction: "desc" };
			}
			case "limit":
			case "take": {
				const value = this.expectLimit();
				return { kind: "limit", value };
			}
			case "summarize":
				return this.parseSummarize();
			case "project":
				return this.parseProject();
			default:
				throw new Error(`Unsupported query stage: ${keyword}`);
		}
	}

	private parseSummarize(): RestrictedAplStage {
		const aggregations: SummarizeAggregation[] = [];

		while (this.peekIdentifierLower() !== "by" && !this.isStageBoundary()) {
			const alias = this.expectSafeAlias();
			this.expectSymbol("=");
			aggregations.push({ alias, fn: this.parseSummarizeFunction() });

			if (this.peekSymbol(",")) {
				this.index++;
				continue;
			}
			break;
		}

		if (aggregations.length === 0) {
			throw new Error("summarize requires at least one aggregation");
		}

		const by: RestrictedAplField[] = [];
		if (this.peekIdentifierLower() === "by") {
			this.index++;
			while (!this.isStageBoundary()) {
				by.push(this.expectField());
				if (this.peekSymbol(",")) {
					this.index++;
					continue;
				}
				break;
			}
			if (by.length === 0) throw new Error("summarize by requires fields");
		}

		return { kind: "summarize", aggregations, by };
	}

	private parseSummarizeFunction(): SummarizeFunction {
		const name = this.expectIdentifier().toLowerCase();
		this.expectSymbol("(");

		if (name === "count") {
			this.expectSymbol(")");
			return { kind: "count" };
		}

		if (name === "countif") {
			const expr = this.parseOrExpr();
			this.expectSymbol(")");
			return { kind: "countif", expr };
		}

		if (name === "avg" || name === "sum" || name === "min" || name === "max") {
			const field = this.expectNumericAggregateField();
			this.expectSymbol(")");
			return { kind: "numeric", name, field };
		}

		if (name === "percentile") {
			const field = this.expectNumericAggregateField();
			this.expectSymbol(",");
			const percentile = this.expectNumberLiteral();
			this.expectSymbol(")");
			if (percentile <= 0 || percentile >= 100) {
				throw new Error("percentile must be between 0 and 100");
			}
			return { kind: "percentile", field, percentile };
		}

		throw new Error(`Unsupported summarize function: ${name}`);
	}

	private parseProject(): RestrictedAplStage {
		const columns: ProjectColumn[] = [];

		while (!this.isStageBoundary()) {
			const first = this.expectIdentifier();
			if (this.peekSymbol("=")) {
				if (!SAFE_APL_IDENTIFIER.test(first)) {
					throw new Error(`Unsafe identifier: ${first}`);
				}
				this.index++;
				columns.push({
					alias: first,
					source: this.expectSafeIdentifierOrField(),
				});
			} else {
				columns.push({ source: this.resolveSafeIdentifierOrField(first) });
			}

			if (this.peekSymbol(",")) {
				this.index++;
				continue;
			}
			break;
		}

		if (columns.length === 0) throw new Error("project requires fields");
		return { kind: "project", columns };
	}

	private parseOrExpr(): RestrictedAplExpr {
		let expr = this.parseAndExpr();
		while (this.peekIdentifierLower() === "or") {
			this.index++;
			expr = { kind: "or", left: expr, right: this.parseAndExpr() };
		}
		return expr;
	}

	private parseAndExpr(): RestrictedAplExpr {
		let expr = this.parsePrimaryExpr();
		while (this.peekIdentifierLower() === "and") {
			this.index++;
			expr = { kind: "and", left: expr, right: this.parsePrimaryExpr() };
		}
		return expr;
	}

	private parsePrimaryExpr(): RestrictedAplExpr {
		if (this.peekSymbol("(")) {
			this.index++;
			const expr = this.parseOrExpr();
			this.expectSymbol(")");
			return expr;
		}
		return this.parsePredicate();
	}

	private parsePredicate(): RestrictedAplExpr {
		const field = this.expectField();
		const opToken = this.next();

		if (!opToken) throw new Error("Expected operator");

		if (opToken.kind === "identifier") {
			const op = opToken.value.toLowerCase();
			if (op === "contains" || op === "startswith") {
				const value = this.expectString();
				return { kind: "stringMatch", field, op, value };
			}

			if (op === "in") {
				this.expectSymbol("(");
				const values: LiteralValue[] = [];
				while (!this.peekSymbol(")")) {
					values.push(this.expectLiteral());
					if (this.peekSymbol(",")) {
						this.index++;
						continue;
					}
					break;
				}
				this.expectSymbol(")");
				if (values.length === 0)
					throw new Error("in requires at least one value");
				return { kind: "in", field, values };
			}
		}

		if (opToken.kind === "symbol" && this.isCompareOperator(opToken.value)) {
			return {
				kind: "comparison",
				field,
				op: opToken.value,
				value: this.expectLiteral(),
			};
		}

		throw new Error("Unsupported predicate operator");
	}

	private expectLimit(): number {
		const token = this.next();
		if (!token || token.kind !== "number" || !Number.isInteger(token.value)) {
			throw new Error("limit must be an integer");
		}
		if (token.value < 1 || token.value > RESTRICTED_APL_MAX_LIMIT) {
			throw new Error(
				`limit must be between 1 and ${RESTRICTED_APL_MAX_LIMIT}`,
			);
		}
		return token.value;
	}

	private expectNumberLiteral(): number {
		const token = this.next();
		if (!token || token.kind !== "number" || !Number.isFinite(token.value)) {
			throw new Error("Expected number literal");
		}
		return token.value;
	}

	private expectField(): RestrictedAplField {
		const raw = this.expectIdentifier();
		const field = resolveFieldIdentifier(raw);
		if (!field) throw new Error(`Unknown query field: ${raw}`);
		return field;
	}

	private expectNumericAggregateField(): RestrictedAplField {
		const field = this.expectField();
		if (
			field.kind !== "topLevel" ||
			!RESTRICTED_APL_NUMERIC_AGGREGATE_FIELDS.has(field.name)
		) {
			throw new Error(
				`Field cannot be used in numeric aggregation: ${fieldDisplayName(field)}`,
			);
		}
		return field;
	}

	private expectSafeAlias(): string {
		const identifier = this.expectSafeIdentifier();
		if (resolveFieldIdentifier(identifier)) {
			throw new Error(`Aggregation alias cannot shadow field: ${identifier}`);
		}
		return identifier;
	}

	private expectSafeIdentifier(): string {
		const identifier = this.expectIdentifier();
		if (!SAFE_APL_IDENTIFIER.test(identifier)) {
			throw new Error(`Unsafe identifier: ${identifier}`);
		}
		return identifier;
	}

	private expectSafeIdentifierOrField(): AplReference {
		return this.resolveSafeIdentifierOrField(this.expectIdentifier());
	}

	private resolveSafeIdentifierOrField(identifier: string): AplReference {
		const field = resolveFieldIdentifier(identifier);
		if (field) return { kind: "field", field };
		if (!SAFE_APL_IDENTIFIER.test(identifier)) {
			throw new Error(`Unsafe identifier: ${identifier}`);
		}
		return { kind: "identifier", name: identifier };
	}

	private expectLiteral(): LiteralValue {
		const token = this.next();
		if (!token) throw new Error("Expected literal value");
		if (token.kind === "string" || token.kind === "number") return token.value;
		if (token.kind === "identifier") {
			const value = token.value.toLowerCase();
			if (value === "true") return true;
			if (value === "false") return false;
			if (value === "null") return null;
		}
		throw new Error("Expected string, number, boolean, or null literal");
	}

	private expectString(): string {
		const token = this.next();
		if (!token || token.kind !== "string") {
			throw new Error("Expected string literal");
		}
		return token.value;
	}

	private expectIdentifier(): string {
		const token = this.next();
		if (!token || token.kind !== "identifier") {
			throw new Error("Expected identifier");
		}
		return token.value;
	}

	private expectKeyword(value: string) {
		const identifier = this.expectIdentifier();
		if (identifier.toLowerCase() !== value) {
			throw new Error(`Expected ${value}`);
		}
	}

	private expectSymbol(value: SymbolValue) {
		const token = this.next();
		if (!token || token.kind !== "symbol" || token.value !== value) {
			throw new Error(`Expected ${value}`);
		}
	}

	private consumePipeIfPresent() {
		if (this.peekSymbol("|")) this.index++;
	}

	private peekSymbol(value: string): boolean {
		const token = this.tokens[this.index];
		return token?.kind === "symbol" && token.value === value;
	}

	private peekIdentifierLower(): string | null {
		const token = this.tokens[this.index];
		return token?.kind === "identifier" ? token.value.toLowerCase() : null;
	}

	private next(): Token | undefined {
		return this.tokens[this.index++];
	}

	private isDone(): boolean {
		return this.index >= this.tokens.length;
	}

	private isStageBoundary(): boolean {
		return this.isDone() || this.peekSymbol("|");
	}

	private isCompareOperator(value: string): value is CompareOperator {
		return (
			value === "==" ||
			value === "!=" ||
			value === ">" ||
			value === ">=" ||
			value === "<" ||
			value === "<="
		);
	}
}

const topLevelFieldToApl = (field: RestrictedAplTopLevelField): string =>
	RESTRICTED_APL_TOP_LEVEL_FIELDS[field].apl;

const nestedFieldToApl = (
	field: Extract<RestrictedAplField, { kind: "nested" }>,
) =>
	[
		RESTRICTED_APL_NESTED_ROOTS[field.root].apl,
		...field.path.map((segment) => `['${segment}']`),
	].join("");

const fieldToApl = (field: RestrictedAplField): string =>
	field.kind === "topLevel"
		? topLevelFieldToApl(field.name)
		: nestedFieldToApl(field);

const nestedFieldAlias = (
	field: Extract<RestrictedAplField, { kind: "nested" }>,
) => [field.root, ...field.path].join("_");

const fieldToStringApl = (field: RestrictedAplField): string => {
	if (field.kind === "nested") return `tostring(${fieldToApl(field)})`;
	if (field.name === "request_body" || field.name === "response_body") {
		return `dynamic_to_json(${fieldToApl(field)})`;
	}
	return fieldToApl(field);
};

const fieldToComparisonApl = (
	field: RestrictedAplField,
	value: LiteralValue,
): string => {
	if (field.kind !== "nested") return fieldToApl(field);
	if (typeof value === "string") return `tostring(${fieldToApl(field)})`;
	if (typeof value === "number") return `todouble(${fieldToApl(field)})`;
	if (typeof value === "boolean") return `tobool(${fieldToApl(field)})`;
	return fieldToApl(field);
};

const fieldToInApl = (
	field: RestrictedAplField,
	values: LiteralValue[],
): string => {
	if (field.kind !== "nested") return fieldToApl(field);
	const nonNullValues = values.filter((value) => value !== null);
	if (nonNullValues.every((value) => typeof value === "string")) {
		return `tostring(${fieldToApl(field)})`;
	}
	if (nonNullValues.every((value) => typeof value === "number")) {
		return `todouble(${fieldToApl(field)})`;
	}
	if (nonNullValues.every((value) => typeof value === "boolean")) {
		return `tobool(${fieldToApl(field)})`;
	}
	return fieldToApl(field);
};

const fieldToSummarizeByApl = (field: RestrictedAplField): string => {
	if (field.kind === "topLevel") return fieldToApl(field);
	return `${nestedFieldAlias(field)} = tostring(${fieldToApl(field)})`;
};

const referenceToApl = (reference: AplReference): string => {
	if (reference.kind === "identifier") return reference.name;
	const { field } = reference;
	if (field.kind === "nested") return `tostring(${fieldToApl(field)})`;
	return fieldToApl(field);
};

const referenceToProjectApl = ({ alias, source }: ProjectColumn): string => {
	if (alias) return `${alias} = ${referenceToApl(source)}`;
	if (source.kind === "field" && source.field.kind === "nested") {
		return `${nestedFieldAlias(source.field)} = ${referenceToApl(source)}`;
	}
	return referenceToApl(source);
};

export const parseRestrictedApl = ({
	query,
	allowedStages,
}: {
	query: string | undefined;
	allowedStages?: RestrictedAplStageKind[];
}): RestrictedAplAst => {
	const trimmed = query?.trim();
	if (!trimmed) return { stages: [] };
	const ast = new Parser(tokenize(trimmed)).parse();
	const allowed = allowedStages ?? DEFAULT_RESTRICTED_APL_STAGES;
	for (const stage of ast.stages) {
		if (!allowed.includes(stage.kind)) {
			throw new Error(`Unsupported query stage: ${stage.kind}`);
		}
	}
	return ast;
};

export const escapeAplString = (value: string): string =>
	value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const literalToApl = (value: LiteralValue): string => {
	if (typeof value === "string") return `'${escapeAplString(value)}'`;
	if (value === null) return "null";
	return String(value);
};

const exprToApl = (expr: RestrictedAplExpr): string => {
	switch (expr.kind) {
		case "comparison":
			return `${fieldToComparisonApl(expr.field, expr.value)} ${expr.op} ${literalToApl(expr.value)}`;
		case "stringMatch":
			return `${fieldToStringApl(expr.field)} ${expr.op} '${escapeAplString(expr.value)}'`;
		case "in":
			return `${fieldToInApl(expr.field, expr.values)} in (${expr.values.map(literalToApl).join(", ")})`;
		case "and":
		case "or":
			return `(${exprToApl(expr.left)} ${expr.kind} ${exprToApl(expr.right)})`;
	}
};

const summarizeFunctionToApl = (fn: SummarizeFunction): string => {
	switch (fn.kind) {
		case "count":
			return "count()";
		case "countif":
			return `countif(${exprToApl(fn.expr)})`;
		case "numeric":
			return `${fn.name}(${fieldToApl(fn.field)})`;
		case "percentile":
			return `percentile(${fieldToApl(fn.field)}, ${fn.percentile})`;
	}
};

export const restrictedAplToApl = (ast: RestrictedAplAst): string[] =>
	ast.stages.map((stage) => {
		switch (stage.kind) {
			case "where":
				return `| where ${exprToApl(stage.expr)}`;
			case "orderBy":
				return `| order by ${referenceToApl(stage.target)} ${stage.direction}`;
			case "limit":
				return `| limit ${stage.value}`;
			case "summarize": {
				const aggregations = stage.aggregations
					.map(({ alias, fn }) => `${alias} = ${summarizeFunctionToApl(fn)}`)
					.join(", ");
				const by =
					stage.by.length > 0
						? ` by ${stage.by.map(fieldToSummarizeByApl).join(", ")}`
						: "";
				return `| summarize ${aggregations}${by}`;
			}
			case "project":
				return `| project ${stage.columns.map(referenceToProjectApl).join(", ")}`;
		}
		throw new Error("Unsupported restricted APL stage");
	});
