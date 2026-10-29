/** Best-effort display redaction, not a guarantee that a command is safe to share. */
export function redactCommand(command: string): string {
  return command
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(/(\b[a-z][a-z\d+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/((?:--?|\b)(?:[\w-]*(?:token|password|passwd|secret|api[_-]?key|authorization|credential)[\w-]*|pwd)\s*(?:=|:|\s)\s*)(?:"[^"]*"|'[^']*'|[^\s&;]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}
