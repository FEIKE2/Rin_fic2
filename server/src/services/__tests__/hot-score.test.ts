import { describe, expect, it } from "bun:test";
import { calculateContentHotScore, HOT_CONFIG_DEFAULTS } from "../hot-score";

describe("hot-score", () => {
    it("calculates capped content hot score from text length and images", () => {
        const longText = "字".repeat(4500);
        const images = "\n![a](a.png)\n![b](b.png)\n<img src=\"c.png\" />";

        expect(calculateContentHotScore(longText + images, HOT_CONFIG_DEFAULTS)).toBe(210);
    });

    it("uses full thousand-character buckets for text score", () => {
        expect(calculateContentHotScore("a".repeat(999), HOT_CONFIG_DEFAULTS)).toBe(0);
        expect(calculateContentHotScore("a".repeat(1000), HOT_CONFIG_DEFAULTS)).toBe(50);
    });
});
