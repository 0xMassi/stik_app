import { describe, expect, it } from "vitest";
import { SETTINGS_SOCIAL_LINKS } from "./settingsSocialLinks";

describe("SETTINGS_SOCIAL_LINKS", () => {
  it("includes Help, X, and Discord with expected hrefs", () => {
    const byId = new Map(SETTINGS_SOCIAL_LINKS.map((link) => [link.id, link]));

    expect(byId.get("help")?.href).toBe("mailto:help@stik.ink");
    expect(byId.get("x")?.href).toBe("https://x.com/stik_app");
    expect(byId.get("discord")?.href).toBe("https://discord.gg/ptPc6Zmc");
  });

  it("defines accessibility labels for each entry", () => {
    for (const link of SETTINGS_SOCIAL_LINKS) {
      expect(link.ariaLabel.trim().length).toBeGreaterThan(0);
      expect(link.label.trim().length).toBeGreaterThan(0);
    }
  });
});
