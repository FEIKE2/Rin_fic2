import { describe, expect, it } from "vitest";
import { parseImageUrlMetadata } from "../image-upload";

describe("parseImageUrlMetadata", () => {
  it("parses image presentation fragment options", () => {
    expect(parseImageUrlMetadata("https://example.com/a.png#blurhash=abc&width=1200&height=800&display=wide&layout=left&size=50%")).toEqual({
      src: "https://example.com/a.png",
      blurhash: "abc",
      width: 1200,
      height: 800,
      display: "wide",
      layout: "left",
      size: "50%",
    });
  });

  it("ignores unsupported presentation values", () => {
    expect(parseImageUrlMetadata("https://example.com/a.png#display=float&layout=start&size=expression(alert(1))")).toEqual({
      src: "https://example.com/a.png",
      blurhash: undefined,
      width: undefined,
      height: undefined,
      display: undefined,
      layout: undefined,
      size: undefined,
    });
  });
});
