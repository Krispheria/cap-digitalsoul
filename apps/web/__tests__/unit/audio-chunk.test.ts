import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio-extract", () => ({
	getFfmpegPath: () => "/usr/bin/ffmpeg",
}));

import { detectAudioContainer, parseSegmentList } from "@/lib/audio-chunk";

describe("detectAudioContainer", () => {
	it("detects mp3 by ID3 tag and by frame sync", () => {
		expect(detectAudioContainer(Buffer.from("ID3\x04\x00"))).toBe("mp3");
		expect(detectAudioContainer(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe(
			"mp3",
		);
	});

	it("detects fragmented mp4 by the ftyp box", () => {
		const header = Buffer.concat([
			Buffer.from([0x00, 0x00, 0x00, 0x18]),
			Buffer.from("ftypiso5"),
		]);
		expect(detectAudioContainer(header)).toBe("mp4");
	});

	it("returns unknown for anything else", () => {
		expect(detectAudioContainer(Buffer.from("hello"))).toBe("unknown");
		expect(detectAudioContainer(Buffer.alloc(0))).toBe("unknown");
	});
});

describe("parseSegmentList", () => {
	it("parses ffmpeg csv segment lists with quotes and CRLF", () => {
		const csv =
			'"chunk-000.mp3",0.000000,1200.021333\r\nchunk-001.mp3,1200.021333,1500.5\r\n\r\n';
		expect(parseSegmentList(csv)).toEqual([
			{ fileName: "chunk-000.mp3", startSeconds: 0, endSeconds: 1200.021333 },
			{
				fileName: "chunk-001.mp3",
				startSeconds: 1200.021333,
				endSeconds: 1500.5,
			},
		]);
	});

	it("skips malformed lines", () => {
		expect(parseSegmentList("nope\n,1,2\nchunk.mp3,x,2\n")).toEqual([]);
	});
});
