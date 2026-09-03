import { serverEnv } from "@cap/env";

export type TranscriptionProvider = "groq" | "assemblyai";

export const DEFAULT_GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3";

export function getTranscriptionProvider(): TranscriptionProvider | null {
	const env = serverEnv();
	const hasGroq = Boolean(env.GROQ_API_KEY);
	const hasAssembly = Boolean(env.ASSEMBLY_API_KEY);
	const explicit = env.TRANSCRIPTION_PROVIDER;

	if (explicit === "groq") {
		return hasGroq ? "groq" : null;
	}
	if (explicit === "assemblyai") {
		return hasAssembly ? "assemblyai" : null;
	}
	if (hasGroq) {
		return "groq";
	}
	if (hasAssembly) {
		return "assemblyai";
	}
	return null;
}

export function isTranscriptionConfigured(): boolean {
	return getTranscriptionProvider() !== null;
}

export function getGroqTranscriptionModel(): string {
	const model = serverEnv().GROQ_TRANSCRIPTION_MODEL?.trim();
	return model ? model : DEFAULT_GROQ_TRANSCRIPTION_MODEL;
}
