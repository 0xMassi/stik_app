import { describe, it, expect } from "vitest";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";
import { LOCALES, resolveLocale, translate, isLocale } from ".";

describe("locale catalogues", () => {
  it("zh-CN covers every English key", () => {
    const missing = Object.keys(en).filter((k) => !(k in zhCN));
    expect(missing).toEqual([]);
  });

  it("zh-CN has no keys absent from English", () => {
    const extra = Object.keys(zhCN).filter((k) => !(k in en));
    expect(extra).toEqual([]);
  });

  it("has no empty translations", () => {
    const empty = Object.entries(zhCN)
      .filter(([, v]) => v.trim() === "")
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("keeps placeholders consistent between locales", () => {
    const placeholders = (s: string) =>
      (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
    const drifted = Object.keys(en).filter(
      (k) =>
        placeholders(en[k as keyof typeof en]) !==
        placeholders(zhCN[k as keyof typeof en]),
    );
    expect(drifted).toEqual([]);
  });

  it("has no zh-CN value left identical to English", () => {
    // Catches strings that were added to the catalogue but never actually
    // translated. Six theme names sat here reading as English because I had
    // classified them as proper nouns.
    const INTENTIONAL = new Set([
      // key caps, printed in Latin on the physical keyboard
      "common.enter",
      "common.esc",
      "common.opt",
      "common.tab",
      // acronym and brand name
      "settings.tab.ai",
      "social.discord",
      "social.x",
    ]);

    const untranslated = Object.keys(en).filter(
      (k) =>
        !INTENTIONAL.has(k) &&
        zhCN[k as keyof typeof en] === en[k as keyof typeof en] &&
        /[A-Za-z]{2}/.test(en[k as keyof typeof en]),
    );

    expect(untranslated).toEqual([]);
  });

  it("registers a catalogue for every advertised locale", () => {
    expect(LOCALES.map((l) => l.id).sort()).toEqual(["en", "zh-CN"]);
  });
});

describe("resolveLocale", () => {
  it("falls back to English for empty or unknown values", () => {
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("kl-GL")).toBe("en");
  });

  it("matches exact locale tags", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-CN");
    expect(resolveLocale("en")).toBe("en");
  });

  it("maps Chinese variants onto zh-CN", () => {
    expect(resolveLocale("zh")).toBe("zh-CN");
    expect(resolveLocale("zh-Hans")).toBe("zh-CN");
    expect(resolveLocale("zh_TW")).toBe("zh-CN");
  });

  it("matches on base language for regional English tags", () => {
    expect(resolveLocale("en-GB")).toBe("en");
  });
});

describe("translate", () => {
  it("returns the string for the active locale", () => {
    expect(translate("zh-CN", "settings.title")).toBe("设置");
    expect(translate("en", "settings.title")).toBe("Settings");
  });

  it("substitutes named placeholders", () => {
    // An unknown key falls back to the key itself as the template, which
    // gives us a stable interpolation fixture that no catalogue reword
    // can break.
    const template = "{count} of {total}" as keyof typeof en;
    expect(translate("en", template, { count: 3, total: 9 })).toBe("3 of 9");
  });

  it("falls back to English when a locale lacks the key", () => {
    const orphan = "definitely.not.a.real.key" as keyof typeof en;
    expect(translate("zh-CN", orphan)).toBe(orphan);
  });

  it("leaves unknown placeholders untouched", () => {
    expect(translate("en", "common.cancel", { unused: "x" })).toBe("cancel");
  });
});

describe("isLocale", () => {
  it("accepts supported ids and rejects others", () => {
    expect(isLocale("zh-CN")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
