export const groqVerboseWithWords = {
	text: "Um, this is a real example. Erm nothing else.",
	language: "english",
	duration: 4,
	words: [
		{ word: "Um,", start: 0.12, end: 0.38 },
		{ word: "this", start: 0.52, end: 0.72 },
		{ word: "is", start: 0.73, end: 0.84 },
		{ word: "a", start: 0.85, end: 0.91 },
		{ word: "real", start: 0.93, end: 1.13 },
		{ word: "example.", start: 1.14, end: 1.51 },
		{ word: "Erm", start: 2.3, end: 2.57 },
		{ word: "nothing", start: 2.7, end: 3.07 },
		{ word: "else.", start: 3.09, end: 3.4 },
	],
	segments: [
		{
			id: 0,
			start: 0.12,
			end: 3.4,
			text: " Um, this is a real example. Erm nothing else.",
			no_speech_prob: 0.01,
		},
	],
};

export const groqVerboseSegmentsOnly = {
	text: "Hello there, welcome back.",
	language: "en",
	duration: 3,
	segments: [
		{ id: 0, start: 0.5, end: 1.5, text: " Hello there," },
		{ id: 1, start: 1.6, end: 2.6, text: " welcome back." },
	],
};

export const groqVerboseSilent = {
	text: "",
	language: "english",
	duration: 2,
	words: [],
	segments: [],
};
