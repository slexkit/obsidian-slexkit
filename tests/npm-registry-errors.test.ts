import { describe, expect, test } from "bun:test";
import { isMissingVersion } from "../scripts/npm-registry-errors.mjs";

describe("npm release registry errors", () => {
  test("only an explicit E404 reports a missing version", () => {
    expect(isMissingVersion({ stdout: JSON.stringify({ error: { code: "E404" } }) })).toBe(true);
    for (const code of ["E401", "E403", "E429", "ECONNRESET"]) {
      expect(isMissingVersion({ stdout: JSON.stringify({ error: { code } }) })).toBe(false);
    }
    expect(isMissingVersion({ stdout: "not json" })).toBe(false);
    expect(isMissingVersion(new Error("network failed"))).toBe(false);
  });
});
