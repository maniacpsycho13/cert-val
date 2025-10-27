import * as crypto from "crypto";

export function createCertificateHash(data: string): number[] {
    const hash = crypto.createHash("sha256").update(data).digest();
    return Array.from(hash);
  }