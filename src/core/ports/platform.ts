export interface Platform {
  hostname(): string;
  osName(): 'windows' | 'macos' | 'linux' | 'unknown';
  appVersion(): string;
  dataDir(): string;
  homeDir(): string;
}
