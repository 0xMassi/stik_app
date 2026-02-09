export type SettingsSocialLinkId = "help" | "x" | "discord";

export interface SettingsSocialLink {
  id: SettingsSocialLinkId;
  label: string;
  ariaLabel: string;
  href: string;
}

export const SETTINGS_SOCIAL_LINKS: SettingsSocialLink[] = [
  {
    id: "help",
    label: "Help",
    ariaLabel: "Email support at help@stik.ink",
    href: "mailto:help@stik.ink",
  },
  {
    id: "x",
    label: "X",
    ariaLabel: "Open Stik profile on X",
    href: "https://x.com/stik_app",
  },
  {
    id: "discord",
    label: "Discord",
    ariaLabel: "Join the Stik Discord server",
    href: "https://discord.gg/ptPc6Zmc",
  },
];
