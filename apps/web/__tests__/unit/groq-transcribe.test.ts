import { describe, expect, it, vi } from "vitest";
import {
	groqVerboseSegmentsOnly,
	groqVerboseSilent,
	groqVerboseWithWords,
} from "../fixtures/groq-responses";

vi.mock("@/lib/audio-chunk", () => ({
	prepareAudioChunksForTranscription: vi.fn(),
}));

import {
	GROQ_TRANSCRIPTIONS_URL,
	getGroqLanguageParam,
	groqWordsToEditWords,
	mergeChunkTranscriptions,
	NoSpokenAudioError,
	normalizeGroqLanguage,
	requestGroqTranscription,
	synthesizeWordsFromSegments,
} from "@/lib/groq-transcribe";

describe("getGroqLanguageParam", () => {
	it("omits the language for auto detection", () => {
		expect(getGroqLanguageParam("auto")).toBeUndefined();
	});

	it("passes explicit ISO codes through", () => {
		expect(getGroqLanguageParam("es")).toBe("es");
	});
});

describe("normalizeGroqLanguage", () => {
	it("maps language names and codes to ISO-639-1", () => {
		expect(normalizeGroqLanguage("English")).toBe("en");
		expect(normalizeGroqLanguage("spanish")).toBe("es");
		expect(normalizeGroqLanguage("es")).toBe("es");
		expect(normalizeGroqLanguage("klingon")).toBeNull();
		expect(normalizeGroqLanguage(undefined)).toBeNull();
	});
});

describe("groqWordsToEditWords", () => {
	it("converts seconds to milliseconds and applies the chunk offset", () => {
		const words = groqWordsToEditWords(groqVerboseWithWords, 1_200_040);
		expect(words).toHaveLength(9);
		expect(words[0]).toEqual({
			text: "Um,",
			start: 1_200_160,
			end: 1_200_420,
			confidence: null,
			speaker: null,
			channel: null,
		});
		expect(words.at(-1)).toMatchObject({ text: "else.", end: 1_203_440 });
	});

	it("drops empty words", () => {
		const words = groqWordsToEditWords(
			{ words: [{ word: "  ", start: 0, end: 1 }] },
			0,
		);
		expect(words).toEqual([]);
	});
});

describe("synthesizeWordsFromSegments", () => {
	it("splits segment text into monotonic words proportional to length", () => {
		const words = synthesizeWordsFromSegments(
			groqVerboseSegmentsOnly.segments,
			0,
		);
		expect(words.map((word) => word.text)).toEqual([
			"Hello",
			"there,",
			"welcome",
			"back.",
		]);
		expect(words[0]?.start).toBe(500);
		expect(words[1]?.end).toBe(1500);
		expect(words[2]?.start).toBe(1600);
		expect(words[3]?.end).toBe(2600);
		for (let index = 1; index < words.length; index++) {
			const previous = words[index - 1];
			const current = words[index];
			expect(Number(current?.start)).toBeGreaterThanOrEqual(
				Number(previous?.end),
			);
			expect(Number(current?.end)).toBeGreaterThan(Number(current?.start));
		}
	});

	it("keeps every word at least one millisecond long", () => {
		const words = synthesizeWordsFromSegments(
			[{ start: 1, end: 1.001, text: "a b c d e" }],
			0,
		);
		expect(words).toHaveLength(5);
		for (const word of words) {
			expect(Number(word.end)).toBeGreaterThan(Number(word.start));
		}
	});
});

describe("mergeChunkTranscriptions", () => {
	it("merges chunks with offsets into one AssemblyAI-shaped result", () => {
		const merged = mergeChunkTranscriptions(
			[
				{ result: groqVerboseWithWords, offsetMs: 0, durationMs: 4000 },
				{ result: groqVerboseWithWords, offsetMs: 1_200_040, durationMs: 4000 },
			],
			{ model: "whisper-large-v3", language: "auto" },
		);
		expect(merged.words).toHaveLength(18);
		expect(merged.words[9]?.start).toBe(1_200_160);
		expect(merged.speech_model_used).toBe("groq/whisper-large-v3");
		expect(merged.language_code).toBe("en");
		expect(merged.audioDurationMs).toBe(1_204_040);
		expect(merged.chunkCount).toBe(2);
		expect(merged.synthesizedWords).toBe(false);
		expect(merged.text).toBe(
			`${groqVerboseWithWords.text} ${groqVerboseWithWords.text}`,
		);
	});

	it("prefers the explicit language over the detected one", () => {
		const merged = mergeChunkTranscriptions(
			[{ result: groqVerboseWithWords, offsetMs: 0 }],
			{ model: "whisper-large-v3", language: "es" },
		);
		expect(merged.language_code).toBe("es");
	});

	it("synthesizes words from segments when the model returns none", () => {
		const merged = mergeChunkTranscriptions(
			[{ result: groqVerboseSegmentsOnly, offsetMs: 0 }],
			{ model: "whisper-large-v3-turbo", language: "auto" },
		);
		expect(merged.synthesizedWords).toBe(true);
		expect(merged.words.map((word) => word.text)).toEqual([
			"Hello",
			"there,",
			"welcome",
			"back.",
		]);
	});

	it("throws NoSpokenAudioError on silence", () => {
		expect(() =>
			mergeChunkTranscriptions([{ result: groqVerboseSilent, offsetMs: 0 }], {
				model: "whisper-large-v3",
				language: "auto",
			}),
		).toThrow(NoSpokenAudioError);
	});
});

describe("requestGroqTranscription", () => {
	it("posts a verbose_json multipart request with both granularities", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => groqVerboseWithWords,
			text: async () => "",
		})) as unknown as typeof fetch;

		const result = await requestGroqTranscription(
			{
				buffer: Buffer.from("audio"),
				filename: "chunk-000.mp3",
				contentType: "audio/mpeg",
			},
			{ apiKey: "key", model: "whisper-large-v3", language: "es", fetchImpl },
		);

		expect(result).toEqual(groqVerboseWithWords);
		const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect(url).toBe(GROQ_TRANSCRIPTIONS_URL);
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer key",
		);
		const body = init.body as FormData;
		expect(body.get("model")).toBe("whisper-large-v3");
		expect(body.get("response_format")).toBe("verbose_json");
		expect(body.getAll("timestamp_granularities[]")).toEqual([
			"word",
			"segment",
		]);
		expect(body.get("language")).toBe("es");
		expect((body.get("file") as File).name).toBe("chunk-000.mp3");
	});

	it("omits the language field for auto detection and surfaces API errors", async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: false,
			status: 400,
			json: async () => ({}),
			text: async () => '{"error":"bad request"}',
		})) as unknown as typeof fetch;

		await expect(
			requestGroqTranscription(
				{
					buffer: Buffer.from("audio"),
					filename: "chunk-000.mp3",
					contentType: "audio/mpeg",
				},
				{
					apiKey: "key",
					model: "whisper-large-v3",
					language: "auto",
					fetchImpl,
				},
			),
		).rejects.toThrow("Groq transcription failed (400)");

		const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect((init.body as FormData).get("language")).toBeNull();
	});
});
