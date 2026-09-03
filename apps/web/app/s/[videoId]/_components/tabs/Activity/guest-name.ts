"use client";

import { useCallback, useEffect, useState } from "react";

import { normalizeGuestName } from "@/lib/guest-comment";

const STORAGE_KEY = "cap-guest-comment-name";

export function readGuestName(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return normalizeGuestName(window.localStorage.getItem(STORAGE_KEY));
	} catch {
		return null;
	}
}

export function useGuestName() {
	const [guestName, setStoredGuestName] = useState<string | null>(null);

	useEffect(() => {
		setStoredGuestName(readGuestName());
	}, []);

	const setGuestName = useCallback((name: string) => {
		const normalized = normalizeGuestName(name);
		if (!normalized) return;
		try {
			window.localStorage.setItem(STORAGE_KEY, normalized);
		} catch (error) {
			console.warn("Could not remember the name for this browser", error);
		}
		setStoredGuestName(normalized);
	}, []);

	return [guestName, setGuestName] as const;
}
