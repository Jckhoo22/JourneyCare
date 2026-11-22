/** Bytes of entropy; each renders as two hex characters. */
const TOKEN_BYTES = 16;

/**
 * Random token embedded in a group's invite QR and link. [G1]
 *
 * 16 bytes → 32 hex characters, comfortably over the 20-character floor that
 * plan.md sets and that firestore.rules enforces on create. Uses the Web Crypto
 * CSPRNG rather than Math.random, since possession of this token is what lets
 * someone request to join.
 */
export const generateJoinToken = (): string => {
    const bytes = new Uint8Array(TOKEN_BYTES);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
