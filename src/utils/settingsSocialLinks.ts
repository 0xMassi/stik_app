import type { TranslationKey } from "@/i18n";

export type SettingsSocialLinkId = "help" | "x" | "discord";

export interface SettingsSocialLink {
  id: SettingsSocialLinkId;
  /// Translation keys rather than literals: the footer renders these, and the
  /// aria-label is what a screen reader announces, so both follow the UI
  /// language. X and Discord resolve to the same brand name in every locale.
  labelKey: TranslationKey;
  ariaLabelKey: TranslationKey;
  href: string;
}

export const SETTINGS_SOCIAL_LINKS: SettingsSocialLink[] = [
  {
    id: "help",
    labelKey: "social.help",
    ariaLabelKey: "social.helpTitle",
    href: "mailto:help@stik.ink",
  },
  {
    id: "x",
    labelKey: "social.x",
    ariaLabelKey: "social.xTitle",
    href: "https://x.com/stik_app",
  },
  {
    id: "discord",
    labelKey: "social.discord",
    ariaLabelKey: "social.discordTitle",
    href: "https://discord.gg/gG8vdCCRzW",
  },
];
