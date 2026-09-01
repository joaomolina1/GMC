import { describe, expect, it } from "vitest";
import {
  parseSkillPackageIds,
  withSkillPackageId,
  withoutSkillPackageId,
} from "@lib/agent-skills/ids";

describe("parseSkillPackageIds", () => {
  it("keeps string arrays", () => {
    expect(parseSkillPackageIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("drops empty and non-string values", () => {
    expect(parseSkillPackageIds(["ok", "", 3, null])).toEqual(["ok"]);
  });

  it("parses JSON strings", () => {
    expect(parseSkillPackageIds('["a","b"]')).toEqual(["a", "b"]);
  });

  it("returns [] for invalid input", () => {
    expect(parseSkillPackageIds(undefined)).toEqual([]);
    expect(parseSkillPackageIds("not-json")).toEqual([]);
    expect(parseSkillPackageIds({})).toEqual([]);
  });
});

describe("skill package id helpers", () => {
  it("appends without duplicating", () => {
    expect(withSkillPackageId(["a"], "b")).toEqual(["a", "b"]);
    expect(withSkillPackageId(["a"], "a")).toEqual(["a"]);
  });

  it("removes an id", () => {
    expect(withoutSkillPackageId(["a", "b"], "a")).toEqual(["b"]);
  });
});
