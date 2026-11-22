import { describe, expect, it } from "vitest";
import { greetingForHour } from "./greeting";
import { strings } from "../locale/English";

describe("greetingForHour", () => {
    const home = strings.home;

    it("says good morning from 5am until noon", () => {
        expect(greetingForHour(5, home)).toBe(home.greetingMorning);
        expect(greetingForHour(9, home)).toBe(home.greetingMorning);
        expect(greetingForHour(11, home)).toBe(home.greetingMorning);
    });

    it("switches to afternoon at noon", () => {
        expect(greetingForHour(12, home)).toBe(home.greetingAfternoon);
        expect(greetingForHour(16, home)).toBe(home.greetingAfternoon);
    });

    it("switches to evening at 5pm", () => {
        expect(greetingForHour(17, home)).toBe(home.greetingEvening);
        expect(greetingForHour(21, home)).toBe(home.greetingEvening);
    });

    it("falls back to the neutral greeting late at night", () => {
        // 10pm through 4am: "Good night" would read as a goodbye on the
        // home screen, so the neutral "Hello" wins.
        expect(greetingForHour(22, home)).toBe(home.greetingNight);
        expect(greetingForHour(2, home)).toBe(home.greetingNight);
        expect(greetingForHour(4, home)).toBe(home.greetingNight);
    });
});
