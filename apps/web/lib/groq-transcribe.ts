import { promises as fs } from "node:fs";
import { basename } from "node:path";
import {
	AI_GENERATION_LANGUAGE_AUTO,
	type AiGenerationLanguage,
} from "@cap/web-domain";
import { prepareAudioChunksForTranscription } from "@/lib/audio-chunk";
import type {
	AssemblyAIEditResult,
	AssemblyAIEditWord,
} from "@/lib/edit-transcript";

export const GROQ_TRANSCRIPTIONS_URL =
	"https://api.groq.com/openai/v1/audio/transcriptions";

const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
	english: "en",
	spanish: "es",
	french: "fr",
	german: "de",
	portuguese: "pt",
	italian: "it",
	dutch: "nl",
	polish: "pl",
	romanian: "ro",
	slovak: "sk",
	russian: "ru",
	turkish: "tr",
	japanese: "ja",
	korean: "ko",
	chinese: "zh",
	arabic: "ar",
	hindi: "hi",
	bengali: "bn",
	tamil: "ta",
	telugu: "te",
	marathi: "mr",
	gujarati: "gu",
	urdu: "ur",
	persian: "fa",
	hebrew: "he",
};

export interface GroqWord {
	word: string;
	start: number;
	end: number;
}

export interface GroqSegment {
	id?: number;
	start: number;
	end: number;
	text: string;
	no_speech_prob?: number;
}

export interface GroqVerboseTranscription {
	text?: string;
	language?: string;
	duration?: number;
	words?: GroqWord[] | null;
	segments?: GroqSegment[] | null;
}

export interface GroqTranscriptionFile {
	buffer: Buffer;
	filename: string;
	contentType: string;
}

export interface GroqTranscriptionOptions {
	apiKey: string;
	model: string;
	language: AiGenerationLanguage;
	fetchImpl?: typeof fetch;
}

export interface GroqChunkTranscription {
	result: GroqVerboseTranscription;
	offsetMs: number;
	durationMs?: number;
}

export interface MergedGroqTranscription extends AssemblyAIEditResult {
	words: AssemblyAIEditWord[];
	text: string;
	audioDurationMs: number;
	chunkCount: number;
	synthesizedWords: boolean;
}

export class NoSpokenAudioError extends Error {
	constructor(message = "Groq returned no spoken audio") {
		super(message);
		this.name = "NoSpokenAudioError";
	}
}

const toMs = (seconds: number) => Math.round(seconds * 1000);

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export function getGroqLanguageParam(
	language: AiGenerationLanguage,
): string | undefined {
	return language === AI_GENERATION_LANGUAGE_AUTO ? undefined : language;
}

export function normalizeGroqLanguage(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) {
		return null;
	}
	if (/^[a-z]{2}$/.test(trimmed)) {
		return trimmed;
	}
	return LANGUAGE_NAME_TO_CODE[trimmed] ?? null;
}

async function fetchWithRetry(
	fetchImpl: typeof fetch,
	url: string,
	options: RequestInit,
): Promise<Response> {
	let lastError: Error | undefined;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetchImpl(url, options);
			if (!RETRYABLE_STATUSES.has(response.status)) {
				return response;
			}
			if (attempt < MAX_RETRIES) {
				const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
				console.log(
					`[groq-transcribe] Got ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
				);
				await sleep(delay);
				continue;
			}
			return response;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < MAX_RETRIES) {
				const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
				console.log(
					`[groq-transcribe] Request failed: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
				);
				await sleep(delay);
			}
		}
	}

	throw lastError || new Error("Groq request failed after retries");
}

export async function requestGroqTranscription(
	file: GroqTranscriptionFile,
	options: GroqTranscriptionOptions,
): Promise<GroqVerboseTranscription> {
	const form = new FormData();
	form.append(
		"file",
		new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
		file.filename,
	);
	form.append("model", options.model);
	form.append("response_format", "verbose_json");
	form.append("timestamp_granularities[]", "word");
	form.append("timestamp_granularities[]", "segment");
	const language = getGroqLanguageParam(options.language);
	if (language) {
		form.append("language", language);
	}

	const response = await fetchWithRetry(
		options.fetchImpl ?? fetch,
		GROQ_TRANSCRIPTIONS_URL,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${options.apiKey}` },
			body: form,
		},
	);

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Groq transcription failed (${response.status}): ${body.slice(0, 500)}`,
		);
	}

	return (await response.json()) as GroqVerboseTranscription;
}

export function groqWordsToEditWords(
	result: GroqVerboseTranscription,
	offsetMs: number,
): AssemblyAIEditWord[] {
	return (result.words ?? [])
		.map((word) => ({
			text: (word.word ?? "").trim(),
			start: toMs(word.start) + offsetMs,
			end: toMs(word.end) + offsetMs,
			confidence: null,
			speaker: null,
			channel: null,
		}))
		.filter((word) => word.text.length > 0);
}

export function synthesizeWordsFromSegments(
	segments: readonly GroqSegment[],
	offsetMs: number,
): AssemblyAIEditWord[] {
	const words: AssemblyAIEditWord[] = [];

	for (const segment of segments) {
		const tokens = (segment.text ?? "").trim().split(/\s+/).filter(Boolean);
		if (tokens.length === 0) {
			continue;
		}
		const startMs = toMs(segment.start) + offsetMs;
		const endMs = toMs(segment.end) + offsetMs;
		const span = Math.max(endMs - startMs, tokens.length);
		const totalChars =
			tokens.reduce((sum, token) => sum + token.length, 0) || tokens.length;
		let cursor = startMs;

		tokens.forEach((token, index) => {
			const isLast = index === tokens.length - 1;
			const share = isLast
				? startMs + span - cursor
				: Math.round((span * token.length) / totalChars);
			const wordEnd = Math.max(cursor + 1, cursor + share);
			words.push({
				text: token,
				start: cursor,
				end: wordEnd,
				confidence: null,
				speaker: null,
				channel: null,
			});
			cursor = wordEnd;
		});
	}

	return words;
}

export function mergeChunkTranscriptions(
	chunks: readonly GroqChunkTranscription[],
	options: { model: string; language: AiGenerationLanguage },
): MergedGroqTranscription {
	const words: AssemblyAIEditWord[] = [];
	let text = "";
	let detectedLanguage: string | null = null;
	let synthesizedWords = false;
	let audioDurationMs = 0;

	for (const chunk of chunks) {
		const fromWords = groqWordsToEditWords(chunk.result, chunk.offsetMs);
		if (fromWords.length > 0) {
			words.push(...fromWords);
		} else {
			const synthesized = synthesizeWordsFromSegments(
				chunk.result.segments ?? [],
				chunk.offsetMs,
			);
			if (synthesized.length > 0) {
				synthesizedWords = true;
				words.push(...synthesized);
			}
		}

		const chunkText = (chunk.result.text ?? "").trim();
		if (chunkText) {
			text = text ? `${text} ${chunkText}` : chunkText;
			if (!detectedLanguage) {
				detectedLanguage = normalizeGroqLanguage(chunk.result.language);
			}
		}

		const chunkDurationMs =
			typeof chunk.result.duration === "number" &&
			Number.isFinite(chunk.result.duration)
				? toMs(chunk.result.duration)
				: (chunk.durationMs ?? 0);
		audioDurationMs = Math.max(
			audioDurationMs,
			chunk.offsetMs + chunkDurationMs,
		);
	}

	if (!text || words.length === 0) {
		throw new NoSpokenAudioError();
	}

	return {
		words,
		text,
		language_code: getGroqLanguageParam(options.language) ?? detectedLanguage,
		speech_model_used: `groq/${options.model}`,
		audioDurationMs,
		chunkCount: chunks.length,
		synthesizedWords,
	};
}

export async function transcribeAudioWithGroq(
	audioBuffer: Buffer,
	options: GroqTranscriptionOptions,
): Promise<MergedGroqTranscription> {
	const { chunks, cleanup } =
		await prepareAudioChunksForTranscription(audioBuffer);

	try {
		const results: GroqChunkTranscription[] = [];
		for (const chunk of chunks) {
			const buffer = await fs.readFile(chunk.filePath);
			const result = await requestGroqTranscription(
				{
					buffer,
					filename: basename(chunk.filePath),
					contentType: "audio/mpeg",
				},
				options,
			);
			results.push({
				result,
				offsetMs: chunk.offsetMs,
				durationMs: chunk.durationMs,
			});
		}
		return mergeChunkTranscriptions(results, options);
	} finally {
		await cleanup();
	}
}
