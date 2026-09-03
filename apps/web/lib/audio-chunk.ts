import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { getFfmpegPath } from "@/lib/audio-extract";

export const TRANSCRIPTION_CHUNK_SECONDS = 1200;
export const TRANSCRIPTION_CHUNK_BITRATE = "32k";

export type AudioContainer = "mp3" | "mp4" | "unknown";

export interface AudioChunk {
	filePath: string;
	index: number;
	offsetMs: number;
	durationMs: number;
}

export interface SegmentListEntry {
	fileName: string;
	startSeconds: number;
	endSeconds: number;
}

export interface AudioChunkOptions {
	chunkSeconds?: number;
	bitrate?: string;
}

export interface PreparedAudioChunks {
	chunks: AudioChunk[];
	cleanup: () => Promise<void>;
}

export function detectAudioContainer(buffer: Buffer): AudioContainer {
	if (buffer.length >= 3 && buffer.toString("latin1", 0, 3) === "ID3") {
		return "mp3";
	}
	if (
		buffer.length >= 2 &&
		buffer[0] === 0xff &&
		((buffer[1] ?? 0) & 0xe0) === 0xe0
	) {
		return "mp3";
	}
	if (buffer.length >= 8 && buffer.toString("latin1", 4, 8) === "ftyp") {
		return "mp4";
	}
	return "unknown";
}

export function parseSegmentList(csv: string): SegmentListEntry[] {
	return csv
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.flatMap((line) => {
			const [file, start, end] = line.split(",");
			const fileName = (file ?? "").trim().replace(/^"|"$/g, "");
			const startSeconds = Number(start);
			const endSeconds = Number(end);
			if (
				!fileName ||
				!Number.isFinite(startSeconds) ||
				!Number.isFinite(endSeconds)
			) {
				return [];
			}
			return [{ fileName, startSeconds, endSeconds }];
		});
}

export async function prepareAudioChunksForTranscription(
	input: Buffer,
	options: AudioChunkOptions = {},
): Promise<PreparedAudioChunks> {
	const ffmpeg = getFfmpegPath();
	const workDir = join(tmpdir(), `transcribe-chunks-${randomUUID()}`);
	await fs.mkdir(workDir, { recursive: true });

	const cleanup = async () => {
		try {
			await fs.rm(workDir, { recursive: true, force: true });
		} catch {}
	};

	const container = detectAudioContainer(input);
	const inputPath = join(
		workDir,
		container === "mp4" ? "input.mp4" : "input.mp3",
	);
	const listPath = join(workDir, "chunks.csv");
	const chunkSeconds = options.chunkSeconds ?? TRANSCRIPTION_CHUNK_SECONDS;
	const bitrate = options.bitrate ?? TRANSCRIPTION_CHUNK_BITRATE;

	try {
		await fs.writeFile(inputPath, input);
		await runFfmpeg(ffmpeg, [
			"-i",
			inputPath,
			"-vn",
			"-ac",
			"1",
			"-ar",
			"16000",
			"-acodec",
			"libmp3lame",
			"-b:a",
			bitrate,
			"-f",
			"segment",
			"-segment_time",
			String(chunkSeconds),
			"-reset_timestamps",
			"1",
			"-segment_list",
			listPath,
			"-segment_list_type",
			"csv",
			"-y",
			join(workDir, "chunk-%03d.mp3"),
		]);

		const entries = parseSegmentList(await fs.readFile(listPath, "utf8"));
		if (entries.length === 0) {
			throw new Error("Audio chunking produced no segments");
		}

		const chunks = entries.map((entry, index) => ({
			filePath: isAbsolute(entry.fileName)
				? entry.fileName
				: join(workDir, entry.fileName),
			index,
			offsetMs: Math.round(entry.startSeconds * 1000),
			durationMs: Math.max(
				0,
				Math.round((entry.endSeconds - entry.startSeconds) * 1000),
			),
		}));

		return { chunks, cleanup };
	} catch (error) {
		await cleanup();
		throw error;
	}
}

function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(/*turbopackIgnore: true*/ ffmpeg, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderr = "";

		proc.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("error", (err: Error) => {
			reject(new Error(`Audio chunking failed: ${err.message}`));
		});

		proc.on("close", (code: number | null) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Audio chunking failed with code ${code}: ${stderr}`));
			}
		});
	});
}
