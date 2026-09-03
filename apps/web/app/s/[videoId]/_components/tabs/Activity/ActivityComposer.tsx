"use client";

import { Button, Input } from "@cap/ui";
import type { Video } from "@cap/web-domain";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { useCurrentUser } from "@/app/Layout/AuthContext";
import { SignedImageUrl } from "@/components/SignedImageUrl";
import { GUEST_NAME_MAX_LENGTH } from "@/lib/guest-comment";
import type { CommentType } from "../../../Share";
import { RecordActionButtons } from "../../media-comment/record-actions";
import { useOptionalPlayback } from "../../playback/PlaybackContext";
import type { RecordIntentKind } from "../../timeline/TimelineComposer";
import CommentInput from "./CommentInput";
import { useGuestName } from "./guest-name";

// Same deal as the timeline: capture and upload code only loads once someone
// presses record.
const RecorderSurface = dynamic(
	() => import("../../timeline/recording/RecorderSurface"),
	{ ssr: false },
);

interface ActivityComposerProps {
	videoId: Video.VideoId;
	/** Whose video this is, for the placeholder. */
	ownerName?: string | null;
	disabled?: boolean;
	onSubmit: (content: string) => void;
	setShowAuthOverlay: (show: boolean) => void;
	/** Owner is on Pro and the viewer is signed in; the upload path re-checks. */
	canRecordMedia?: boolean;
	onOptimisticComment?: (comment: CommentType) => void;
	onCommentSuccess?: (comment: CommentType) => void;
}

/**
 * The panel's composer, pinned above the comment list. Leading with it (rather
 * than parking it under the scroll) means the primary action is the first thing
 * in the sidebar and an empty panel reads as an invitation.
 */
export function ActivityComposer({
	videoId,
	ownerName,
	disabled,
	onSubmit,
	setShowAuthOverlay,
	canRecordMedia = false,
	onOptimisticComment,
	onCommentSuccess,
}: ActivityComposerProps) {
	const user = useCurrentUser();
	const [guestName, setGuestName] = useGuestName();
	const [nameDraft, setNameDraft] = useState("");
	const playback = useOptionalPlayback();
	const [recordIntent, setRecordIntent] = useState<{
		kind: RecordIntentKind;
		t: number;
	} | null>(null);

	const startRecording = useCallback(
		(kind: RecordIntentKind) => {
			// Anchor to wherever the viewer is watching, same as a text comment,
			// and get out of the way of whatever they are about to record.
			const t = playback?.getCurrentTime() ?? 0;
			playback?.pause();
			setRecordIntent({ kind, t });
		},
		[playback],
	);

	// Signed out and yet to say who they are: the recording is routinely shared
	// with someone who has no account here, so a name is all we ask for.
	if (!user && !guestName) {
		return (
			<form
				className="flex flex-col gap-2 p-2 rounded-lg border bg-gray-1 border-gray-5"
				onSubmit={(e) => {
					e.preventDefault();
					setGuestName(nameDraft);
				}}
			>
				<p className="text-sm text-gray-11">
					{ownerName
						? `Add your name to respond to ${ownerName}`
						: "Add your name to leave a comment"}
				</p>
				<div className="flex gap-2 items-center">
					<Input
						value={nameDraft}
						onChange={(e) => setNameDraft(e.target.value)}
						placeholder="Your name"
						maxLength={GUEST_NAME_MAX_LENGTH}
						aria-label="Your name"
					/>
					<Button
						type="submit"
						size="sm"
						variant="dark"
						disabled={nameDraft.trim().length === 0}
					>
						Continue
					</Button>
				</div>
				<button
					type="button"
					onClick={() => setShowAuthOverlay(true)}
					className="self-start text-xs font-medium text-blue-9"
				>
					Or sign in
				</button>
			</form>
		);
	}

	if (!user) {
		return (
			<CommentInput
				collapsible
				onSubmit={onSubmit}
				disabled={disabled}
				placeholder={
					ownerName ? `Respond to ${ownerName}...` : "Leave a comment"
				}
				buttonLabel="Comment"
				avatar={
					<SignedImageUrl
						image={null}
						name={guestName ?? "You"}
						className="size-7 rounded-full"
						letterClass="text-[11px] font-medium"
					/>
				}
			/>
		);
	}

	return (
		<>
			<CommentInput
				collapsible
				onSubmit={onSubmit}
				disabled={disabled}
				placeholder={
					ownerName ? `Respond to ${ownerName}...` : "Leave a comment"
				}
				buttonLabel="Comment"
				avatar={
					<SignedImageUrl
						image={user.imageUrl}
						name={user.name ?? "You"}
						className="size-7 rounded-full"
						letterClass="text-[11px] font-medium"
					/>
				}
				actions={
					canRecordMedia ? (
						<RecordActionButtons
							disabled={disabled}
							onSelect={startRecording}
						/>
					) : null
				}
			/>

			{recordIntent && (
				<RecorderSurface
					kind={recordIntent.kind}
					timestamp={recordIntent.t}
					videoId={videoId}
					onOptimisticComment={onOptimisticComment}
					onCommentSuccess={onCommentSuccess}
					onClose={() => setRecordIntent(null)}
					// The sidebar's tab pane clips overflow; an anchored card would
					// render above it, invisible (with a very live microphone).
					placement="floating"
				/>
			)}
		</>
	);
}
