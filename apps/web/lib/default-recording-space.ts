import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
	organizationMembers,
	organizations,
	sharedVideos,
	spaceMembers,
	spaces,
	spaceVideos,
} from "@cap/database/schema";
import {
	Organisation,
	type Space,
	type User,
	type Video,
} from "@cap/web-domain";
import { and, eq, or } from "drizzle-orm";

export type DefaultRecordingSpaceTarget =
	| { kind: "organization"; organizationId: Organisation.OrganisationId }
	| {
			kind: "space";
			spaceId: Space.SpaceId;
			organizationId: Organisation.OrganisationId;
	  };

// The dashboard's "All <Org>" entry is not a space row: it carries the
// organization's own id and its membership lives in shared_videos. A default
// can therefore be either kind of id, so both tables are consulted.
export async function resolveDefaultRecordingSpace(
	userId: User.UserId,
	defaultSpaceId: Space.SpaceIdOrOrganisationId,
): Promise<DefaultRecordingSpaceTarget | null> {
	const [space] = await db()
		.select({ id: spaces.id, organizationId: spaces.organizationId })
		.from(spaces)
		.innerJoin(
			spaceMembers,
			and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, userId)),
		)
		.where(eq(spaces.id, defaultSpaceId))
		.limit(1);

	if (space)
		return {
			kind: "space",
			spaceId: space.id,
			organizationId: space.organizationId,
		};

	const [organization] = await db()
		.select({ id: organizations.id })
		.from(organizations)
		.leftJoin(
			organizationMembers,
			and(
				eq(organizationMembers.organizationId, organizations.id),
				eq(organizationMembers.userId, userId),
			),
		)
		.where(
			and(
				eq(organizations.id, Organisation.OrganisationId.make(defaultSpaceId)),
				or(
					eq(organizations.ownerId, userId),
					eq(organizationMembers.userId, userId),
				),
			),
		)
		.limit(1);

	if (organization)
		return { kind: "organization", organizationId: organization.id };

	return null;
}

export async function addVideoToDefaultRecordingSpace({
	userId,
	videoId,
	videoOrgId,
	defaultSpaceId,
}: {
	userId: User.UserId;
	videoId: Video.VideoId;
	videoOrgId: Organisation.OrganisationId;
	defaultSpaceId: Space.SpaceIdOrOrganisationId | null | undefined;
}): Promise<void> {
	if (!defaultSpaceId) return;

	const target = await resolveDefaultRecordingSpace(userId, defaultSpaceId);

	// A default pointing outside the org the recording landed in would file the
	// Cap where the rest of that org cannot see it, so it is dropped instead.
	if (!target || target.organizationId !== videoOrgId) return;

	if (target.kind === "organization") {
		await db().insert(sharedVideos).values({
			id: nanoId(),
			videoId,
			organizationId: target.organizationId,
			sharedByUserId: userId,
		});
		return;
	}

	await db().insert(spaceVideos).values({
		id: nanoId(),
		videoId,
		spaceId: target.spaceId,
		addedById: userId,
	});
}
