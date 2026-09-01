const entrypointPatterns = [
  ["login", /\blogin\b|signIn|signin/i],
  ["register", /\bregister\b|signup|signUp/i],
  ["logout", /\blogout\b|signOut|signout/i],
  ["session", /\bsession\b|createSession/i],
  ["password", /\bpassword\b|resetPassword|forgotPassword/i],
  ["permission", /\bpermission\b|authorize|authorization/i],
  ["role", /\brole\b|rbac/i],
  ["subscription", /\bsubscription\b|billing|stripe/i],
  ["invite", /\binvite\b|invitation|referral/i],
];

const domainPatterns = [
  ["auth", /\bauth\b|login|register|session|password/i],
  ["billing", /\bbilling\b|subscription|stripe/i],
  ["permission", /\bpermission\b|role|rbac/i],
  ["upload", /\bupload\b|file/i],
  ["notification", /\bnotification\b|email|sms/i],
  ["user", /\buser\b|profile|account/i],
];

export function detectBusinessEntrypoints(filePath, sourceText) {
  const haystack = `${filePath}\n${sourceText}`;
  return entrypointPatterns
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([entrypoint]) => entrypoint);
}

export function detectBusinessDomain(filePath, entrypoints = []) {
  const haystack = `${filePath}\n${entrypoints.join(" ")}`;
  const match = domainPatterns.find(([, pattern]) => pattern.test(haystack));
  return match ? match[0] : "general";
}
