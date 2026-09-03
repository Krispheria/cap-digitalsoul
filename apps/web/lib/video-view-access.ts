import { provideOptionalAuth, VideosPolicy } from "@cap/web-backend";
import { Policy, type Video } from "@cap/web-domain";
import { Effect, Exit } from "effect";

import * as EffectRuntime from "@/lib/server";

// Same gate the share page runs, so it already covers the public flag,
// org/space membership, the org email restriction and video/space passwords.
// It returns true for a videoId that does not exist, so callers must have
// loaded the row first.
export async function canViewerOpenVideo(
	videoId: Video.VideoId,
): Promise<boolean> {
	const exit = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.succeed(true).pipe(
			Policy.withPublicPolicy(videosPolicy.canView(videoId)),
		);
	}).pipe(provideOptionalAuth, EffectRuntime.runPromiseExit);

	return Exit.isSuccess(exit);
}
