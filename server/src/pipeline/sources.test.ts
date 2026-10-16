import { describe, expect, it } from "vitest";
import { parseSourceUrl } from "./sources.ts";

describe("parseSourceUrl", () => {
  it("accepts the usual YouTube link shapes", () => {
    const want = { kind: "youtube", id: "J7DzL2_Na80" };
    for (const url of [
      "https://www.youtube.com/watch?v=J7DzL2_Na80",
      "https://youtube.com/watch?v=J7DzL2_Na80&t=120s&list=PL123",
      "https://m.youtube.com/watch?v=J7DzL2_Na80",
      "https://youtu.be/J7DzL2_Na80?si=abc",
      "https://www.youtube.com/shorts/J7DzL2_Na80",
      "https://www.youtube.com/live/J7DzL2_Na80",
      "https://www.youtube-nocookie.com/embed/J7DzL2_Na80",
      "  https://youtu.be/J7DzL2_Na80  ",
    ]) {
      expect(parseSourceUrl(url), url).toEqual(want);
    }
  });

  it("rejects other hosts (Drive and Vimeo included), look-alikes and malformed IDs", () => {
    for (const url of [
      "https://example.com/watch?v=J7DzL2_Na80",
      "https://youtube.com.evil.com/watch?v=J7DzL2_Na80",
      "https://evil.com/?u=https://youtu.be/J7DzL2_Na80",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/watch?v=J7DzL2_Na80--exec",
      "https://youtu.be/--exec=rm",
      "https://www.youtube.com/playlist?list=PL123",
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view",
      "https://vimeo.com/123456",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(parseSourceUrl(url), url).toBeNull();
    }
  });
});
