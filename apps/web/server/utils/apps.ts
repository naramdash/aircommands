import { platform } from 'node:os';

export interface AppConfig {
  name: string;
  windows: string;
  darwin: string;
  linux: string;
}

export const AVAILABLE_APPS: AppConfig[] = [
  {
    name: 'chrome',
    windows: 'start chrome',
    darwin: 'open -a "Google Chrome"',
    linux: 'google-chrome &',
  },
  {
    name: 'firefox',
    windows: 'start firefox',
    darwin: 'open -a "Firefox"',
    linux: 'firefox &',
  },
  {
    name: 'paint',
    windows: 'start mspaint',
    darwin: 'open -a "Preview"',
    linux: 'kolourpaint &',
  },
  {
    name: 'vscode',
    windows: 'start code',
    darwin: 'open -a "Visual Studio Code"',
    linux: 'code &',
  },
  {
    name: 'notepad',
    windows: 'start notepad',
    darwin: 'open -a "TextEdit"',
    linux: 'gedit &',
  },
  {
    name: 'terminal',
    windows: 'start cmd',
    darwin: 'open -a "Terminal"',
    linux: 'gnome-terminal &',
  },
  {
    name: 'powershell',
    windows: 'start powershell',
    darwin: 'open -a "Terminal"',
    linux: 'gnome-terminal &',
  },
  {
    name: 'explorer',
    windows: 'start explorer',
    darwin: 'open -a "Finder"',
    linux: 'nautilus &',
  },
  {
    name: 'vlc',
    windows: 'start vlc',
    darwin: 'open -a "VLC"',
    linux: 'vlc &',
  },
  {
    name: 'discord',
    windows: 'start discord',
    darwin: 'open -a "Discord"',
    linux: 'discord &',
  },
  {
    name: 'slack',
    windows: 'start slack',
    darwin: 'open -a "Slack"',
    linux: 'slack &',
  },
  {
    name: 'zoom',
    windows: 'start zoom',
    darwin: 'open -a "Zoom"',
    linux: 'zoom &',
  },
  {
    name: 'teams',
    windows: 'start teams',
    darwin: 'open -a "Microsoft Teams"',
    linux: 'teams &',
  },
  {
    name: 'spotify',
    windows: 'start spotify',
    darwin: 'open -a "Spotify"',
    linux: 'spotify &',
  },
  {
    name: 'gimp',
    windows: 'start gimp',
    darwin: 'open -a "GIMP"',
    linux: 'gimp &',
  },
  {
    name: 'blender',
    windows: 'start blender',
    darwin: 'open -a "Blender"',
    linux: 'blender &',
  },
  {
    name: 'word',
    windows: 'start winword',
    darwin: 'open -a "Microsoft Word"',
    linux: 'libreoffice --writer &',
  },
  {
    name: 'excel',
    windows: 'start excel',
    darwin: 'open -a "Microsoft Excel"',
    linux: 'libreoffice --calc &',
  },
  {
    name: 'powerpoint',
    windows: 'start powerpnt',
    darwin: 'open -a "Microsoft PowerPoint"',
    linux: 'libreoffice --impress &',
  },
  {
    name: 'whatsapp',
    windows: 'start whatsapp',
    darwin: 'open -a "WhatsApp"',
    linux: 'whatsapp-for-linux &',
  },
  {
    name: 'telegram',
    windows: 'start telegram',
    darwin: 'open -a "Telegram"',
    linux: 'telegram-desktop &',
  },
];

export function getAppCommand(appName: string): string | null {
  const app = AVAILABLE_APPS.find((a) => a.name.toLowerCase() === appName.toLowerCase());
  if (!app) return null;

  const currentPlatform = platform();
  if (currentPlatform === 'win32') {
    return app.windows;
  } else if (currentPlatform === 'darwin') {
    return app.darwin;
  } else {
    return app.linux;
  }
}
