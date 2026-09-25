// Draft experiment only: a number-backed stand-in for decimal.js, to measure what exact decimals cost the track path.
// Sums are rounded to 12 places at every step so float drift stays below the balances' own rounding.
const EPS = 1e12;
const r = (value: number) => Math.round(value * EPS) / EPS;
const num = (value: unknown): number =>
	value instanceof FastDecimal ? value.v : Number(value);

export class FastDecimal {
	v: number;
	constructor(value: unknown) {
		this.v = num(value);
	}
	static min(...values: unknown[]) {
		return new FastDecimal(Math.min(...values.map(num)));
	}
	static max(...values: unknown[]) {
		return new FastDecimal(Math.max(...values.map(num)));
	}
	plus(o: unknown) {
		return new FastDecimal(r(this.v + num(o)));
	}
	add(o: unknown) {
		return this.plus(o);
	}
	minus(o: unknown) {
		return new FastDecimal(r(this.v - num(o)));
	}
	sub(o: unknown) {
		return this.minus(o);
	}
	times(o: unknown) {
		return new FastDecimal(r(this.v * num(o)));
	}
	mul(o: unknown) {
		return this.times(o);
	}
	div(o: unknown) {
		return new FastDecimal(r(this.v / num(o)));
	}
	dividedBy(o: unknown) {
		return this.div(o);
	}
	neg() {
		return new FastDecimal(-this.v);
	}
	negated() {
		return this.neg();
	}
	abs() {
		return new FastDecimal(Math.abs(this.v));
	}
	floor() {
		return new FastDecimal(Math.floor(this.v));
	}
	ceil() {
		return new FastDecimal(Math.ceil(this.v));
	}
	round() {
		return new FastDecimal(Math.round(this.v));
	}
	toDecimalPlaces(places = 0) {
		const p = 10 ** places;
		return new FastDecimal(Math.round(this.v * p) / p);
	}
	toDP(places = 0) {
		return this.toDecimalPlaces(places);
	}
	isZero() {
		return this.v === 0;
	}
	isNegative() {
		return this.v < 0;
	}
	isNeg() {
		return this.v < 0;
	}
	isPositive() {
		return this.v > 0;
	}
	isInteger() {
		return Number.isInteger(this.v);
	}
	gt(o: unknown) {
		return this.v > num(o);
	}
	gte(o: unknown) {
		return this.v >= num(o);
	}
	lt(o: unknown) {
		return this.v < num(o);
	}
	lte(o: unknown) {
		return this.v <= num(o);
	}
	eq(o: unknown) {
		return this.v === num(o);
	}
	cmp(o: unknown) {
		const other = num(o);
		return this.v > other ? 1 : this.v < other ? -1 : 0;
	}
	comparedTo(o: unknown) {
		return this.cmp(o);
	}
	toNumber() {
		return this.v === 0 ? 0 : this.v;
	}
	toString() {
		return String(this.v);
	}
	toFixed(places?: number) {
		return this.v.toFixed(places);
	}
	valueOf() {
		return this.v;
	}
}

export const Decimal = FastDecimal;
export default FastDecimal;
