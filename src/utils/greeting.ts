import type { strings } from "../locale/English";

type Locale = typeof strings;

/**
 * Picks the greeting for a given hour of day (0–23).
 *
 * The bands are conservative — 5am-11am morning, 12pm-4pm afternoon,
 * 5pm-9pm evening, otherwise neutral "Hello" (10pm-4am is late enough that
 * "Good night" reads as a goodbye, which is not what a home screen should
 * say). `hour` is an argument rather than read from `Date` so the helper is
 * pure and testable to the minute.
 */
export const greetingForHour = (
    hour: number,
    home: Locale["home"],
): string => {
    if (hour >= 5 && hour < 12) return home.greetingMorning;
    if (hour >= 12 && hour < 17) return home.greetingAfternoon;
    if (hour >= 17 && hour < 22) return home.greetingEvening;
    return home.greetingNight;
};
