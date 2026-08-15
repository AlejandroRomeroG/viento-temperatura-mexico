export function publicAssetUrl(path: string) {
  const relativePath = path.replace(/^\/+/, "");
  if (typeof document === "undefined") return relativePath;
  return new URL(relativePath, document.baseURI).toString();
}
