/**
 * Shared slug rules. Kept free of runtime imports so both the Vite build
 * config and the client bundle can use the same function.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function tagSlug(tag: string): string {
  const slug = slugify(tag);
  return slug === "" ? "untagged" : slug;
}
