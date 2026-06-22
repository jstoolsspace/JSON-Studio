import { describe, expect, it } from "vitest";
import { baseName, formatBytes } from "@jstools/json-ui";

describe("formatBytes", () => {
  it("formats small and large sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500 MB");
  });
});

describe("baseName", () => {
  it("handles both path separators", () => {
    expect(baseName("/home/anton/data.json")).toBe("data.json");
    expect(baseName("C:\\Users\\anton\\data.json")).toBe("data.json");
  });
});
