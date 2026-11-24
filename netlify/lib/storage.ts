import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getStore } from "@netlify/blobs";
export type BlobStore = Pick<
  ReturnType<typeof getStore>,
  "getWithMetadata" | "set" | "delete" | "list" | "getMetadata"
>;
// The blob name is authenticated too, so encrypted credentials cannot be moved between sessions.
export function encryptedStore(raw: BlobStore, key: Buffer, origin: string) {
  const prefix = `${createHash("sha256").update(origin).digest("hex").slice(0, 24)}/`;
  function seal(name: string, value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(prefix + name));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      "base64",
    );
  }
  return {
    async read<T>(name: string): Promise<{ value: T; etag?: string } | null> {
      const entry = await raw.getWithMetadata(prefix + name, {
        type: "text",
        consistency: "strong",
      });
      if (!entry) return null;
      const bytes = Buffer.from(entry.data, "base64");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      decipher.setAAD(Buffer.from(prefix + name));
      return {
        value: JSON.parse(
          Buffer.concat([
            decipher.update(bytes.subarray(28)),
            decipher.final(),
          ]).toString("utf8"),
        ) as T,
        etag: entry.etag,
      };
    },
    async write(
      name: string,
      value: unknown,
      expiresAt?: number,
      etag?: string,
    ) {
      return raw.set(prefix + name, seal(name, value), {
        metadata: expiresAt ? { expiresAt } : {},
        ...(etag ? { onlyIfMatch: etag } : {}),
      });
    },
    remove(name: string) {
      return raw.delete(prefix + name);
    },
    async removePrefix(name: string) {
      for await (const page of raw.list({
        prefix: prefix + name,
        paginate: true,
      }))
        for (const blob of page.blobs) await raw.delete(blob.key);
    },
  };
}

export async function purgeExpiredSessions(raw: BlobStore, now = Date.now()) {
  for await (const page of raw.list({ paginate: true })) {
    for (const blob of page.blobs) {
      const entry = await raw.getMetadata(blob.key, { consistency: "strong" });
      if (
        blob.key.endsWith("/client") ||
        (typeof entry?.metadata.expiresAt === "number" &&
          entry.metadata.expiresAt <= now)
      )
        await raw.delete(blob.key);
    }
  }
}
export function stravaStore() {
  return getStore({ name: "milemark-strava-auth", consistency: "strong" });
}
