/**
 * Money. One formatter, one rounding rule, for the whole app. [S3]
 *
 * It lived on `model/Log.ts` while logs were the only thing that cost
 * anything. T14 renders money on the car page, the group page and the home
 * strip — none of which are log concerns — so a second copy was one careless
 * `toFixed(2)` away. Everything that shows or stores ringgit comes through
 * here.
 */

interface FormatRinggitOptions {
    /**
     * Drop the decimals — "RM 1,011" instead of "RM 1,011.00". Reserved for
     * display-size headline figures where the sen would be visual noise; a
     * COLUMN of amounts must still show two places, or a `RM 1,240.5` above a
     * `RM 90` is two numbers the eye has to re-parse.
     */
    noDecimals?: boolean;
}

/**
 * "RM 250.50" — always two decimal places by default. Pass `noDecimals` for
 * a display-size headline like "RM 1,011".
 */
export const formatRinggit = (
    amount: number,
    { noDecimals = false }: FormatRinggitOptions = {},
): string => {
    const digits = noDecimals ? 0 : 2;
    return `RM ${amount.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })}`;
};

/**
 * Rounds to sen, killing float drift before it can be stored.
 *
 * `0.1 + 0.2` is the classic, but the one that actually bites here is a
 * running total nudged by a hundred `increment()` calls until it holds
 * 1240.4999999999998 — which formats as RM 1,240.50 and then fails an exact
 * comparison against the recalculated value. Every number written to
 * `totalSpend` or `spendByYear` passes through this first.
 */
export const toMoney = (value: number): number => Math.round(value * 100) / 100;
