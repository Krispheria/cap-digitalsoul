import { beforeEach, describe, expect, it, vi } from "vitest";

const envState = vi.hoisted(() => ({
	values: {} as Record<string, string | undefined>,
}));

vi.mock("@cap/env", () => ({
	serverEnv: () => envState.values,
}));

import {
	DEFAULT_GROQ_TRANSCRIPTION_MODEL,
	getGroqTranscriptionModel,
	getTranscriptionProvider,
	isTranscriptionConfigured,
} from "@/lib/transcription-provider";

describe("getTranscriptionProvider", () => {
	beforeEach(() => {
		envState.values = {};
	});

	it("returns null without any key", () => {
		expect(getTranscriptionProvider()).toBeNull();
		expect(isTranscriptionConfigured()).toBe(false);
	});

	it("prefers groq when only GROQ_API_KEY is set", () => {
		envState.values = { GROQ_API_KEY: "g" };
		expect(getTranscriptionProvider()).toBe("groq");
	});

	it("falls back to assemblyai when only ASSEMBLY_API_KEY is set", () => {
		envState.values = { ASSEMBLY_API_KEY: "a" };
		expect(getTranscriptionProvider()).toBe("assemblyai");
	});

	it("prefers groq when both keys are set", () => {
		envState.values = { GROQ_API_KEY: "g", ASSEMBLY_API_KEY: "a" };
		expect(getTranscriptionProvider()).toBe("groq");
	});

	it("honours an explicit provider", () => {
		envState.values = {
			GROQ_API_KEY: "g",
			ASSEMBLY_API_KEY: "a",
			TRANSCRIPTION_PROVIDER: "assemblyai",
		};
		expect(getTranscriptionProvider()).toBe("assemblyai");
	});

	it("returns null when the explicit provider has no key", () => {
		envState.values = { ASSEMBLY_API_KEY: "a", TRANSCRIPTION_PROVIDER: "groq" };
		expect(getTranscriptionProvider()).toBeNull();
	});
});

describe("getGroqTranscriptionModel", () => {
	it("defaults to whisper-large-v3", () => {
		envState.values = {};
		expect(getGroqTranscriptionModel()).toBe(DEFAULT_GROQ_TRANSCRIPTION_MODEL);
		expect(DEFAULT_GROQ_TRANSCRIPTION_MODEL).toBe("whisper-large-v3");
	});

	it("uses the configured model", () => {
		envState.values = { GROQ_TRANSCRIPTION_MODEL: " whisper-large-v3-turbo " };
		expect(getGroqTranscriptionModel()).toBe("whisper-large-v3-turbo");
	});
});
