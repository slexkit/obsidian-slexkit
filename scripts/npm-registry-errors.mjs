// Only an explicit registry E404 proves a version is absent. Network,
// authentication, and malformed responses must stop the release.
export function isMissingVersion(error) {
  try {
    return JSON.parse(String(error?.stdout ?? "")).error?.code === "E404";
  } catch {
    return false;
  }
}
