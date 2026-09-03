export const GUEST_NAME_MAX_LENGTH = 60;

export function normalizeGuestName(
	name: string | null | undefined,
): string | null {
	const trimmed = (name ?? "").trim().replace(/\s+/g, " ");
	if (trimmed.length === 0) return null;
	return trimmed.slice(0, GUEST_NAME_MAX_LENGTH);
}
