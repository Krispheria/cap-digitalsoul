import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	groqVerboseSilent,
	groqVerboseWithWords,
} from "../fixtures/groq-responses";

const mocks = vi.hoisted(() => ({
	assemblyTranscribe: vi.fn(),
	putObject: vi.fn(),
	deleteObject: vi.fn(),
	getInternalSignedObjectUrl: vi.fn(),
	startAiGeneration: vi.fn(),
	groqResponse: vi.fn(),
	groqRequests: [] as { url: string; init: RequestInit }[],
	updates: [] as Record<string, unknown>[],
}));

const schemaMocks = vi.hoisted(() => ({
	videos: {
		id: "videos.id",
		metadata: "videos.metadata",
		transcriptionStatus: "videos.transcriptionStatus",
		updatedAt: "videos.updatedAt",
	},
	organizations: { id: "organizations.id" },
	videoUploads: { videoId: "videoUploads.videoId" },
	videoEdits: {
		videoId: "videoEdits.videoId",
		editSpec: "videoEdits.editSpec",
	},
}));

const videoRow = vi.hoisted(() => ({
	id: "video-123",
	ownerId: "user-456",
	duration: 4,
	settings: null,
	source: { type: "webMP4" },
	isScreenshot: false,
	transcriptionStatus: null,
	updatedAt: new Date("2026-07-30T00:00:00.000Z"),
	metadata: {},
}));

const envState = vi.hoisted(() => ({
	values: {
		GROQ_API_KEY: "test-groq-key",
		NEXTAUTH_SECRET: "test-secret-with-enough-entropy",
	} as Record<string, string | undefined>,
}));

vi.mock("@cap/env", () => ({
	serverEnv: () => envState.values,
}));

vi.mock("@cap/database/schema", () => schemaMocks);

vi.mock("@cap/database", () => ({
	db: () => ({
		select: () => ({
			from: (table: unknown) => {
				if (table === schemaMocks.videoUploads) {
					return { where: () => ({ limit: async () => [] }) };
				}
				if (table === schemaMocks.videoEdits) {
					return { where: async () => [] };
				}
				return {
					leftJoin: () => ({
						where: async () => [{ video: videoRow, orgSettings: null }],
					}),
					where: async () => [videoRow],
				};
			},
		}),
		update: () => ({
			set: (values: Record<string, unknown>) => {
				mocks.updates.push(values);
				return { where: async () => [{ affectedRows: 1 }] };
			},
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ conditions }),
	eq: (field: unknown, value: unknown) => ({ field, value }),
	isNull: (field: unknown) => ({ isNull: field }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
		strings,
		values,
	}),
}));

vi.mock("server-only", () => ({}));

vi.mock("workflow", () => ({
	FatalError: class FatalError extends Error {},
}));

vi.mock("workflow/api", () => ({
	start: vi.fn(),
}));

vi.mock("assemblyai", () => ({
	AssemblyAI: class {
		transcripts = { transcribe: mocks.assemblyTranscribe };
	},
}));

vi.mock("@cap/web-backend/src/Storage/index", () => ({
	Storage: {
		getAccessForVideo: () => ({
			pipe: (runner: (value: unknown) => unknown) =>
				runner([
					{
						putObject: mocks.putObject,
						deleteObject: mocks.deleteObject,
						getInternalSignedObjectUrl: mocks.getInternalSignedObjectUrl,
					},
				]),
		}),
	},
}));

vi.mock("@/lib/workflow-runtime", () => ({
	runWorkflowPromise: (value: unknown) => Promise.resolve(value),
}));

vi.mock("@/lib/video-storage", () => ({
	decodeStorageVideo: (video: unknown) => video,
}));

vi.mock("@/lib/media-client", () => ({
	isMediaServerConfigured: () => true,
	probeVideoViaMediaServer: async () => ({
		audioCodec: "aac",
		videoCodec: "h264",
		duration: 4,
		audioChannels: 2,
		sampleRate: 48_000,
	}),
	extractAudioViaMediaServer: async () => Buffer.from("audio"),
	checkHasAudioTrackViaMediaServer: async () => true,
}));

vi.mock("@/lib/audio-extract", () => ({
	checkHasAudioTrack: async () => true,
	extractAudioFromUrl: async () => ({
		filePath: "/tmp/audio.mp3",
		cleanup: async () => {},
	}),
	getFfmpegPath: () => "/usr/bin/ffmpeg",
}));

vi.mock("@/lib/audio-chunk", () => ({
	prepareAudioChunksForTranscription: async () => ({
		chunks: [
			{
				filePath: "/tmp/chunk-000.mp3",
				index: 0,
				offsetMs: 0,
				durationMs: 4000,
			},
		],
		cleanup: async () => {},
	}),
}));

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	return {
		...original,
		promises: {
			...original.promises,
			readFile: async () => Buffer.from("chunk"),
		},
	};
});

vi.mock("@/lib/audio-enhance", () => ({
	ENHANCED_AUDIO_CONTENT_TYPE: "audio/mpeg",
	ENHANCED_AUDIO_EXTENSION: "mp3",
	enhanceAudioFromUrl: async () => Buffer.from(""),
}));

vi.mock("@/lib/generate-ai", () => ({
	startAiGeneration: mocks.startAiGeneration,
}));

function pipeValue(value: unknown) {
	return { pipe: (runner: (input: unknown) => unknown) => runner(value) };
}

describe("transcribeVideoWorkflow with Groq", () => {
	beforeEach(() => {
		mocks.updates.length = 0;
		mocks.groqRequests.length = 0;
		envState.values = {
			GROQ_API_KEY: "test-groq-key",
			NEXTAUTH_SECRET: "test-secret-with-enough-entropy",
		};
		mocks.assemblyTranscribe.mockReset();
		mocks.groqResponse.mockReset();
		mocks.groqResponse.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => groqVerboseWithWords,
			text: async () => "",
		});
		mocks.putObject.mockImplementation(() => pipeValue(undefined));
		mocks.deleteObject.mockImplementation(() => pipeValue(undefined));
		mocks.getInternalSignedObjectUrl.mockImplementation(() =>
			pipeValue("https://storage.test/object"),
		);
		mocks.startAiGeneration.mockResolvedValue({ success: true, message: "ok" });
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				if (url.startsWith("https://api.groq.com/")) {
					mocks.groqRequests.push({ url, init: init ?? {} });
					return mocks.groqResponse();
				}
				return {
					ok: true,
					status: 200,
					statusText: "OK",
					arrayBuffer: async () => new ArrayBuffer(8),
				};
			}),
		);
	});

	it("persists captions and the word transcript from Groq", async () => {
		const { transcribeVideoWorkflow } = await import("@/workflows/transcribe");

		const result = await transcribeVideoWorkflow({
			videoId: "video-123",
			userId: "user-456",
			aiGenerationEnabled: false,
		});

		expect(result.success).toBe(true);
		expect(mocks.assemblyTranscribe).not.toHaveBeenCalled();
		expect(mocks.groqRequests).toHaveLength(1);

		const body = mocks.groqRequests[0]?.init.body as FormData;
		expect(body.get("model")).toBe("whisper-large-v3");
		expect(body.get("response_format")).toBe("verbose_json");
		expect(body.getAll("timestamp_granularities[]")).toEqual([
			"word",
			"segment",
		]);
		expect(body.get("language")).toBeNull();

		const writes = new Map(
			mocks.putObject.mock.calls.map((call) => [call[0] as string, call[1]]),
		);
		expect(
			[...writes.keys()].filter((key) => key.includes("transcription")),
		).toEqual([
			"user-456/video-123/transcription.vtt",
			"user-456/video-123/transcription.edit.v3.json",
		]);

		const vtt = writes.get("user-456/video-123/transcription.vtt") as string;
		expect(vtt.startsWith("WEBVTT")).toBe(true);
		expect(vtt).toContain("this is a real example.");
		expect(vtt).not.toContain("Um,");

		const { parseEditTranscript } = await import("@/lib/edit-transcript");
		const { decryptEditTranscriptObject } = await import(
			"@/lib/edit-transcript-storage"
		);
		const encrypted = writes.get(
			"user-456/video-123/transcription.edit.v3.json",
		) as string;
		const stored = parseEditTranscript(
			decryptEditTranscriptObject(encrypted, "user-456", "video-123") ?? "",
		);
		expect(stored).toMatchObject({
			version: 3,
			durationMs: 4_000,
			speechModelUsed: "groq/whisper-large-v3",
			languageCode: "en",
		});
		expect(stored?.words).toHaveLength(9);
		expect(stored?.words[0]).toMatchObject({
			text: "Um,",
			startMs: 120,
			endMs: 380,
			confidence: null,
		});

		expect(mocks.updates.at(-1)).toEqual({ transcriptionStatus: "COMPLETE" });
	});

	it("sends the configured model and language", async () => {
		envState.values = {
			...envState.values,
			GROQ_TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
		};
		videoRow.settings = null;

		const { transcribeVideoWorkflow } = await import("@/workflows/transcribe");
		await transcribeVideoWorkflow({
			videoId: "video-123",
			userId: "user-456",
			aiGenerationEnabled: false,
		});

		const body = mocks.groqRequests[0]?.init.body as FormData;
		expect(body.get("model")).toBe("whisper-large-v3-turbo");
	});

	it("marks silent audio as NO_AUDIO without retrying", async () => {
		mocks.groqResponse.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => groqVerboseSilent,
			text: async () => "",
		});

		const { transcribeVideoWorkflow } = await import("@/workflows/transcribe");
		const result = await transcribeVideoWorkflow({
			videoId: "video-123",
			userId: "user-456",
			aiGenerationEnabled: true,
		});

		expect(result).toEqual({
			success: true,
			message: "Video has no spoken audio - skipped transcription",
		});
		expect(mocks.updates).toContainEqual({ transcriptionStatus: "NO_AUDIO" });
		expect(mocks.updates).not.toContainEqual({ transcriptionStatus: "ERROR" });
		expect(mocks.startAiGeneration).not.toHaveBeenCalled();
	});

	it("marks API failures as ERROR", async () => {
		mocks.groqResponse.mockResolvedValue({
			ok: false,
			status: 400,
			json: async () => ({}),
			text: async () => '{"error":{"message":"invalid file"}}',
		});

		const { transcribeVideoWorkflow } = await import("@/workflows/transcribe");
		await expect(
			transcribeVideoWorkflow({
				videoId: "video-123",
				userId: "user-456",
				aiGenerationEnabled: false,
			}),
		).rejects.toThrow("Groq transcription failed (400)");
		expect(mocks.updates).toContainEqual({ transcriptionStatus: "ERROR" });
		expect(mocks.updates).not.toContainEqual({
			transcriptionStatus: "NO_AUDIO",
		});
	});

	it("keeps using AssemblyAI when it is the explicit provider", async () => {
		envState.values = {
			GROQ_API_KEY: "test-groq-key",
			ASSEMBLY_API_KEY: "test-assembly-api-key",
			TRANSCRIPTION_PROVIDER: "assemblyai",
			NEXTAUTH_SECRET: "test-secret-with-enough-entropy",
		};
		mocks.assemblyTranscribe.mockResolvedValue({
			id: "transcript-1",
			status: "completed",
			speech_model_used: "universal-3-5-pro",
			language_code: "en",
			audio_duration: 4,
			words: groqVerboseWithWords.words.map((word) => ({
				text: word.word,
				start: Math.round(word.start * 1000),
				end: Math.round(word.end * 1000),
				confidence: 0.9,
				speaker: null,
				channel: null,
			})),
		});

		const { transcribeVideoWorkflow } = await import("@/workflows/transcribe");
		const result = await transcribeVideoWorkflow({
			videoId: "video-123",
			userId: "user-456",
			aiGenerationEnabled: false,
		});

		expect(result.success).toBe(true);
		expect(mocks.assemblyTranscribe).toHaveBeenCalledTimes(1);
		expect(mocks.groqRequests).toHaveLength(0);
	});
});
