// Comma-separated GitHub login allow-list from env `OWNER_GITHUB_LOGINS`.
// Empty/unset = no one is allowed (fail closed).

export function parseAllowList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.toLowerCase()),
  );
}

export function isAllowed(login: string | undefined, allowList: Set<string>): boolean {
  if (!login) return false;
  return allowList.has(login.toLowerCase());
}
