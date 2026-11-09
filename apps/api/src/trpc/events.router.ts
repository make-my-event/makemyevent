import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { EventStatus, PrismaClient } from "db";
import { z } from "zod";
import { RATE_LIMITS, enforceRateLimits } from "../lib/rate-limit";
import { sanitizeOptionalRichText } from "../lib/sanitize";
import { imageUrl, linkUrl } from "../lib/url-validation";
import { BANNER_BUCKET, eventBannerKey } from "../lib/banner-storage";
import { supabaseAdmin } from "../lib/supabase";
import {
	sendInviteEmail,
	sendTicketEmail,
	sendTransferEmail,
} from "../services/email.service";
import {
	INVITE_TTL_DAYS,
	issueInviteToken,
	verifiedEmail,
} from "../services/invites";
import {
	generateQrToken,
	generateTicketCode,
	hasFullTicketAccess,
	hashTicketAccessToken,
	isSerializationFailure,
	isUniqueViolation,
	issueTicketAccessToken,
} from "../services/tickets";
import { authedProcedure, publicProcedure, router } from "./trpc";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_BANNER_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Event Format and Topic constants — single source of truth.
 * Format = "What kind of event is this?" (mutually exclusive)
 * Topic  = "What subject area?" (primary topic)
 * Tags   = free-form multi-select for discoverability
 */
const EVENT_FORMATS = [
	"meetup",
	"conference",
	"workshop",
	"hackathon",
	"fest",
	"webinar",
	"networking",
	"other",
] as const;

const EVENT_TOPICS = [
	"technology",
	"business",
	"opensource",
	"design",
	"science",
	"arts",
	"social",
	"campus",
	"other",
] as const;

/**
 * Enterprise-grade authorization helper grounded in Cal.com & Pretix RBAC standards.
 * Verifies that the requester has the required role (Owner, Team Member, or Volunteer)
 * for the given event.
 */
export async function assertEventAccess(
	client: PrismaClient,
	slugOrId: string,
	userId: string,
	allowedRoles: Array<
		"OWNER" | "ADMIN" | "EDITOR" | "COORDINATOR" | "VOLUNTEER" | "DEVICE"
	> = ["OWNER", "ADMIN", "EDITOR"],
) {
	const event = await client.event.findFirst({
		where: {
			OR: [{ id: slugOrId }, { slug: slugOrId }],
		},
		select: {
			id: true,
			title: true,
			slug: true,
			capacity: true,
			organizerId: true,
			communityId: true,
			organizer: {
				select: { id: true, ownerId: true },
			},
			volunteers: {
				where: { userId },
				select: { id: true, role: true },
			},
		},
	});

	if (!event) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Event not found.",
		});
	}

	// 1. Direct Organizer Owner
	if (event.organizer.ownerId === userId) {
		return event;
	}

	// 2. Organizer Team Member with appropriate role
	const membership = await client.organizerMember.findFirst({
		where: {
			organizerId: event.organizerId,
			userId,
			role: { in: allowedRoles },
		},
		select: { id: true },
	});
	if (membership) {
		return event;
	}

	// 3. Sub-Community Lead / Admin (if event belongs to a sub-community)
	if (event.communityId) {
		const commMembership = await client.communityMember.findFirst({
			where: {
				communityId: event.communityId,
				userId,
				role: { in: allowedRoles },
			},
			select: { id: true },
		});
		if (commMembership) {
			return event;
		}
	}

	// 4. Event-specific Volunteer (authorized for check-in / volunteer tasks)
	if (allowedRoles.includes("VOLUNTEER") && event.volunteers.length > 0) {
		return event;
	}

	throw new TRPCError({
		code: "FORBIDDEN",
		message: "You do not have permission to manage or scan for this event.",
	});
}

/**
 * Event statuses anyone may see. Drafts and cancelled events are visible only to
 * the event's staff. Matches the public policy already used by `byOrganizer`.
 */
const PUBLIC_EVENT_STATUSES: readonly EventStatus[] = [
	"published",
	"completed",
];

/** Staff roles that may manage an event (in addition to the organizer owner). */
const EVENT_STAFF_ROLES = ["ADMIN", "EDITOR", "COORDINATOR"] as const;

/**
 * Non-throwing staff check for public procedures that return more to staff
 * (drafts, unpublished tiers, contact details). Staff = organizer owner or an
 * organizer member with ADMIN/EDITOR/COORDINATOR, the same set that may manage
 * the event elsewhere in this router.
 */
async function isEventStaff(
	client: PrismaClient,
	event: { organizerId: string; organizer: { ownerId: string } },
	userId: string | null,
): Promise<boolean> {
	if (!userId) return false;
	if (event.organizer.ownerId === userId) return true;
	const membership = await client.organizerMember.findFirst({
		where: {
			organizerId: event.organizerId,
			userId,
			role: { in: [...EVENT_STAFF_ROLES] },
		},
		select: { id: true },
	});
	return membership !== null;
}

/** NOT_FOUND (not FORBIDDEN) so outsiders cannot tell a hidden event exists. */
function hiddenEventNotFound(): TRPCError {
	return new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
}

export interface CheckInOutcome {
	valid: boolean;
	alreadyCheckedIn: boolean;
	checkedInAt: Date | null;
	message: string;
}

/**
 * Shared check-in rules for an issued ticket: status validation plus the atomic
 * CONFIRMED -> CHECKED_IN transition (race-safe across multiple scanners).
 * Used by ticketVerifyCheckIn (staff scan) and the QR chain claim.
 * Pass a transaction client as `client` to make the check-in part of a larger transaction.
 */
export async function checkInIssuedTicket(
	client: Pick<PrismaClient, "issuedTicket">,
	ticket: { id: string; status: string; checkedInAt: Date | null },
): Promise<CheckInOutcome> {
	if (ticket.status === "CHECKED_IN") {
		return {
			valid: false,
			alreadyCheckedIn: true,
			checkedInAt: ticket.checkedInAt,
			message: `Already checked in at ${ticket.checkedInAt?.toLocaleTimeString()}`,
		};
	}

	if (ticket.status === "DROPPED" || ticket.status === "CANCELLED") {
		return {
			valid: false,
			alreadyCheckedIn: false,
			checkedInAt: null,
			message: `This ticket was ${ticket.status.toLowerCase()} and is invalid.`,
		};
	}

	if (ticket.status === "WAITLISTED") {
		return {
			valid: false,
			alreadyCheckedIn: false,
			checkedInAt: null,
			message: "This attendee is on the waitlist and has not been confirmed.",
		};
	}

	// Atomic State Transition (Eliminates Multi-Scanner Race Conditions)
	const now = new Date();
	const updateResult = await client.issuedTicket.updateMany({
		where: {
			id: ticket.id,
			status: "CONFIRMED", // Strictly matches only if still CONFIRMED
		},
		data: {
			status: "CHECKED_IN",
			checkedInAt: now,
		},
	});

	if (updateResult.count === 0) {
		// Another scanner checked in this exact ticket milliseconds ago!
		const reChecked = await client.issuedTicket.findUnique({
			where: { id: ticket.id },
		});
		const checkedInAt = reChecked?.checkedInAt || now;
		return {
			valid: false,
			alreadyCheckedIn: true,
			checkedInAt,
			message: `Already checked in at ${checkedInAt.toLocaleTimeString()}`,
		};
	}

	return {
		valid: true,
		alreadyCheckedIn: false,
		checkedInAt: now,
		message: "Checked in successfully!",
	};
}

export const eventsRouter = router({
	list: publicProcedure.query(({ ctx }) => {
		const now = new Date();
		return ctx.prisma.event.findMany({
			where: {
				status: "published",
				eventEnd: { gte: now },
			},
			orderBy: { eventStart: "asc" },
			select: {
				id: true,
				title: true,
				slug: true,
				description: true,
				format: true,
				bannerUrl: true,
				topic: true,
				tags: true,
				eventStart: true,
				eventEnd: true,
				location: true,
				isOnline: true,
				tickets: {
					select: { id: true, name: true, price: true, quantity: true },
				},
				organizer: {
					select: {
						id: true,
						name: true,
						slug: true,
						type: true,
						category: true,
					},
				},
			},
		});
	}),

	byOrganizer: publicProcedure
		.input(
			z.object({
				organizerId: z.string(),
				status: z
					.enum(["published", "draft", "completed", "cancelled"])
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			let isAuthorizedStaff = false;
			if (ctx.userId) {
				const organizer = await ctx.prisma.organizer.findUnique({
					where: { id: input.organizerId },
					select: { ownerId: true },
				});
				if (organizer?.ownerId === ctx.userId) {
					isAuthorizedStaff = true;
				} else {
					const membership = await ctx.prisma.organizerMember.findFirst({
						where: {
							organizerId: input.organizerId,
							userId: ctx.userId,
							role: { in: ["OWNER", "ADMIN", "EDITOR", "COORDINATOR"] },
						},
					});
					if (membership) {
						isAuthorizedStaff = true;
					}
				}
			}

			// If caller is NOT authorized staff, strictly limit visibility to published/completed
			const allowedStatuses: EventStatus[] | undefined = isAuthorizedStaff
				? input.status
					? [input.status as EventStatus]
					: undefined
				: input.status && input.status === "completed"
					? ["completed" as EventStatus]
					: ["published" as EventStatus];

			return ctx.prisma.event.findMany({
				where: {
					organizerId: input.organizerId,
					...(allowedStatuses ? { status: { in: allowedStatuses } } : {}),
				},
				orderBy: { eventStart: "desc" },
				select: {
					id: true,
					title: true,
					slug: true,
					description: true,
					format: true,
					topic: true,
					tags: true,
					status: true,
					bannerUrl: true,
					eventStart: true,
					eventEnd: true,
					location: true,
					isOnline: true,
					capacity: true,
					tickets: {
						select: { id: true, name: true, price: true, quantity: true },
					},
					_count: {
						select: { issuedTickets: true },
					},
				},
			});
		}),

	getBySlug: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(({ ctx, input }) => {
			return ctx.prisma.event.findFirst({
				where: { slug: input.slug, status: "published" },
				select: {
					id: true,
					title: true,
					slug: true,
					description: true,
					format: true,
					topic: true,
					tags: true,
					status: true,
					bannerUrl: true,
					eventStart: true,
					eventEnd: true,
					timezone: true,
					location: true,
					isOnline: true,
					onlineLink: true,
					capacity: true,
					registrationStart: true,
					registrationEnd: true,
					organizer: {
						select: {
							id: true,
							name: true,
							slug: true,
							type: true,
							category: true,
						},
					},
					tickets: {
						select: {
							id: true,
							name: true,
							price: true,
							quantity: true,
						},
					},
				},
			});
		}),

	manageGetBySlug: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					description: true,
					format: true,
					topic: true,
					tags: true,
					status: true,
					bannerUrl: true,
					shortDescription: true,
					showSpeakers: true,
					eventStart: true,
					eventEnd: true,
					timezone: true,
					location: true,
					isOnline: true,
					onlineLink: true,
					recordingLink: true,
					mapLink: true,
					isPaid: true,
					ticketDescription: true,
					showRsvp: true,
					capacity: true,
					registrationStart: true,
					registrationEnd: true,
					organizerId: true,
					organizer: {
						select: {
							id: true,
							name: true,
							slug: true,
							type: true,
							category: true,
							ownerId: true,
						},
					},
					tickets: {
						select: {
							id: true,
							name: true,
							price: true,
							quantity: true,
						},
					},
				},
			});

			if (!event) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Event not found",
				});
			}

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage this event.",
					});
				}
			}

			return event;
		}),

	create: authedProcedure
		.input(
			z.object({
				organizerId: z.string(),
				communityId: z.string().optional().nullable(),
				title: z.string().min(3).max(120),
				slug: z.string().min(3).max(120),
				description: z.string().optional(),
				format: z.enum(EVENT_FORMATS).default("meetup"),
				topic: z.enum(EVENT_TOPICS).default("technology"),
				tags: z.array(z.string().max(40)).max(10).default([]),
				eventStart: z.string(), // ISO String
				eventEnd: z.string(), // ISO String
				timezone: z.string().default("UTC"),
				registrationStart: z.string().optional(),
				registrationEnd: z.string().optional(),
				isOnline: z.boolean().default(false),
				location: z.string().optional(),
				onlineLink: linkUrl.optional(),
				capacity: z.number().int().positive().default(300),
				tickets: z
					.array(
						z.object({
							name: z.string().min(1),
							price: z.number().int().min(0).default(0),
							quantity: z.number().int().positive().optional(),
						}),
					)
					.default([{ name: "General Pass", price: 0, quantity: 300 }]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Verify the organizer belongs to the current user OR user is a Community Lead
			const organizer = await ctx.prisma.organizer.findUnique({
				where: { id: input.organizerId },
				select: { ownerId: true },
			});

			if (!organizer) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organizer not found.",
				});
			}

			// A sub-community can only host events for its own parent organizer.
			// Without this, a lead of any community could create events under an
			// unrelated organizer (or attach events to another org's community).
			if (input.communityId) {
				const community = await ctx.prisma.community.findUnique({
					where: { id: input.communityId },
					select: { organizerId: true },
				});
				if (!community || community.organizerId !== input.organizerId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"You do not have permission to create events for this organizer or community.",
					});
				}
			}

			let isAuthorized = organizer.ownerId === ctx.userId;

			if (!isAuthorized) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: input.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (membership) {
					isAuthorized = true;
				}
			}

			if (!isAuthorized && input.communityId) {
				const commMembership = await ctx.prisma.communityMember.findFirst({
					where: {
						communityId: input.communityId,
						userId: ctx.userId,
						role: { in: ["OWNER", "ADMIN", "COORDINATOR"] },
					},
				});
				if (commMembership) {
					isAuthorized = true;
				}
			}

			if (!isAuthorized) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"You do not have permission to create events for this organizer or community.",
				});
			}

			const cleanSlug = input.slug
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "");

			const existing = await ctx.prisma.event.findUnique({
				where: { slug: cleanSlug },
			});

			const finalSlug = existing
				? `${cleanSlug}-${Math.random().toString(36).substring(2, 6)}`
				: cleanSlug;

			return ctx.prisma.event.create({
				data: {
					title: input.title.trim(),
					slug: finalSlug,
					description: input.description?.trim() || null,
					format: input.format,
					topic: input.topic,
					tags: input.tags.map((t) => t.trim().toLowerCase()),
					status: "draft",
					eventStart: new Date(input.eventStart),
					eventEnd: new Date(input.eventEnd),
					timezone: input.timezone,
					registrationStart: input.registrationStart
						? new Date(input.registrationStart)
						: null,
					registrationEnd: input.registrationEnd
						? new Date(input.registrationEnd)
						: null,
					isOnline: input.isOnline,
					location: input.isOnline ? null : input.location?.trim() || null,
					onlineLink: input.isOnline ? input.onlineLink?.trim() || null : null,
					capacity: input.capacity || 300,
					organizerId: input.organizerId,
					communityId: input.communityId || null,
					tickets: {
						create: input.tickets.map((t) => ({
							name: t.name.trim(),
							price: t.price,
							quantity: t.quantity !== undefined ? t.quantity : 300,
							isPublished: true,
							allowWaitlist: true,
							allowTransfer: true,
							allowDrop: true,
							maxPerOrder: 1,
						})),
					},
				},
				select: {
					id: true,
					title: true,
					slug: true,
					format: true,
					topic: true,
					eventStart: true,
				},
			});
		}),

	update: authedProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().min(3).max(120),
				description: z.string().optional(),
				shortDescription: z.string().optional(),
				showSpeakers: z.boolean().default(true),
				format: z.enum(EVENT_FORMATS),
				topic: z.enum(EVENT_TOPICS),
				isOnline: z.boolean(),
				location: z.string().optional(),
				onlineLink: linkUrl.optional(),
				recordingLink: linkUrl.optional(),
				mapLink: linkUrl.optional(),
				isPaid: z.boolean().default(false),
				ticketDescription: z.string().optional(),
				showRsvp: z.boolean().default(false),
				timezone: z.string(),
				eventStart: z.string(),
				eventEnd: z.string(),
				registrationStart: z.string().nullable(),
				registrationEnd: z.string().nullable(),
				bannerUrl: z.string().nullable().optional(),
				status: z
					.enum(["draft", "published", "cancelled", "completed"])
					.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { id: input.id },
				select: {
					id: true,
					title: true,
					slug: true,
					bannerUrl: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});

			if (!event) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Event not found",
				});
			}

			// Verify permissions
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit this event.",
					});
				}
			}

			// A banner may only be cleared, left unchanged, or set to a file in
			// this event's own storage folder (uploaded via bannerUploadUrl).
			if (
				input.bannerUrl !== undefined &&
				input.bannerUrl !== null &&
				input.bannerUrl !== event.bannerUrl &&
				!eventBannerKey(input.bannerUrl, event.id)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Upload the banner image through the banner uploader.",
				});
			}

			return ctx.prisma.event.update({
				where: { id: input.id },
				data: {
					title: input.title.trim(),
					description: input.description?.trim() || null,
					shortDescription: input.shortDescription?.trim() || null,
					showSpeakers: input.showSpeakers,
					format: input.format,
					topic: input.topic,
					isOnline: input.isOnline,
					location: input.isOnline ? null : input.location?.trim() || null,
					onlineLink: input.isOnline ? input.onlineLink?.trim() || null : null,
					recordingLink: input.recordingLink?.trim() || null,
					mapLink: input.mapLink?.trim() || null,
					isPaid: input.isPaid,
					ticketDescription: input.ticketDescription?.trim() || null,
					showRsvp: input.showRsvp,
					timezone: input.timezone,
					eventStart: new Date(input.eventStart),
					eventEnd: new Date(input.eventEnd),
					registrationStart: input.registrationStart
						? new Date(input.registrationStart)
						: null,
					registrationEnd: input.registrationEnd
						? new Date(input.registrationEnd)
						: null,
					...(input.bannerUrl !== undefined
						? { bannerUrl: input.bannerUrl }
						: {}),
					...(input.status ? { status: input.status } : {}),
				},
			});
		}),

	delete: authedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { id: input.id },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});

			if (!event) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Event not found",
				});
			}

			// Verify permissions
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to delete this event.",
					});
				}
			}

			await ctx.prisma.event.delete({
				where: { id: input.id },
			});

			return { success: true };
		}),

	rsvpGetForm: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage this event.",
					});
				}
			}

			const rsvpForm = await ctx.prisma.rsvpForm.findUnique({
				where: { eventId: event.id },
				include: { customQuestions: { orderBy: { order: "asc" } } },
			});

			if (rsvpForm) return rsvpForm;

			return ctx.prisma.rsvpForm.create({
				data: { eventId: event.id },
				include: { customQuestions: { orderBy: { order: "asc" } } },
			});
		}),

	rsvpUpdateForm: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				isPublished: z.boolean(),
				allowEdit: z.boolean(),
				requiresApproval: z.boolean(),
				maxRsvpCount: z.number().int().min(1),
				description: z.string().nullable().optional(),
				customQuestions: z.array(
					z.object({
						question: z.string(),
						type: z.string(),
						isMandatory: z.boolean(),
						options: z.string().nullable().optional(),
						description: z.string().nullable().optional(),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage this event.",
					});
				}
			}

			const rsvpForm = await ctx.prisma.rsvpForm.upsert({
				where: { eventId: event.id },
				update: {
					isPublished: input.isPublished,
					allowEdit: input.allowEdit,
					requiresApproval: input.requiresApproval,
					maxRsvpCount: input.maxRsvpCount,
					description: sanitizeOptionalRichText(input.description),
				},
				create: {
					eventId: event.id,
					isPublished: input.isPublished,
					allowEdit: input.allowEdit,
					requiresApproval: input.requiresApproval,
					maxRsvpCount: input.maxRsvpCount,
					description: sanitizeOptionalRichText(input.description),
				},
			});

			// Refresh custom questions
			await ctx.prisma.customQuestion.deleteMany({
				where: { rsvpFormId: rsvpForm.id },
			});

			if (input.customQuestions.length > 0) {
				await ctx.prisma.customQuestion.createMany({
					data: input.customQuestions.map((q, index) => ({
						rsvpFormId: rsvpForm.id,
						question: q.question,
						type: q.type,
						isMandatory: q.isMandatory,
						options: q.options,
						description: q.description,
						order: index,
					})),
				});
			}

			return ctx.prisma.rsvpForm.findUnique({
				where: { id: rsvpForm.id },
				include: { customQuestions: { orderBy: { order: "asc" } } },
			});
		}),

	rsvpGetSubmissions: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership)
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
			}

			const submissions = await ctx.prisma.rsvpSubmission.findMany({
				where: { eventId: event.id },
				include: {
					user: { select: { name: true, email: true } },
					checkIns: true,
				},
				orderBy: { createdAt: "desc" },
			});

			return submissions.map((sub) => {
				const hasCheckedInToday = sub.checkIns.some((ci) => {
					const today = new Date().toISOString().split("T")[0];
					const ciDate = new Date(ci.timestamp).toISOString().split("T")[0];
					return today === ciDate;
				});

				return {
					id: sub.id,
					userId: sub.userId,
					name: sub.user.name,
					email: sub.user.email,
					status: sub.status,
					confirmAttendance: sub.confirmAttendance,
					answers: sub.answers,
					hasCheckedInToday,
					checkIns: sub.checkIns,
				};
			});
		}),

	rsvpUpdateSubmissionStatus: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				submissionId: z.string(),
				status: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership)
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
			}

			// FOSS United rule: when Accepted, automatically confirm attendance (for backwards compatibility/simplicity, though typically users confirm it themselves)
			const confirmAttendance = input.status === "Accepted";

			return ctx.prisma.rsvpSubmission.update({
				where: { id: input.submissionId, eventId: event.id },
				data: { status: input.status, confirmAttendance },
			});
		}),

	rsvpToggleCheckIn: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				submissionId: z.string(),
				action: z.enum(["checkin", "undo"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership)
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
			}

			// The submission must belong to the event the caller was authorized for.
			const submission = await ctx.prisma.rsvpSubmission.findFirst({
				where: { id: input.submissionId, eventId: event.id },
				select: { id: true },
			});
			if (!submission) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "RSVP submission not found.",
				});
			}

			const today = new Date().toISOString().split("T")[0];

			if (input.action === "checkin") {
				// Prevent double check-in for the same day
				const existing = await ctx.prisma.rsvpCheckIn.findFirst({
					where: {
						submissionId: input.submissionId,
						timestamp: {
							gte: new Date(`${today}T00:00:00.000Z`),
							lt: new Date(`${today}T23:59:59.999Z`),
						},
					},
				});

				if (!existing) {
					await ctx.prisma.rsvpCheckIn.create({
						data: { submissionId: input.submissionId },
					});
				}
			} else {
				// Remove today's check-in
				const existing = await ctx.prisma.rsvpCheckIn.findFirst({
					where: {
						submissionId: input.submissionId,
						timestamp: {
							gte: new Date(`${today}T00:00:00.000Z`),
							lt: new Date(`${today}T23:59:59.999Z`),
						},
					},
				});
				if (existing) {
					await ctx.prisma.rsvpCheckIn.delete({ where: { id: existing.id } });
				}
			}

			return { success: true };
		}),

	rsvpGetStats: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
					select: { id: true },
				});
				if (!membership)
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
			}

			const totalAccepted = await ctx.prisma.rsvpSubmission.count({
				where: { eventId: event.id, confirmAttendance: true },
			});

			const today = new Date().toISOString().split("T")[0];
			const totalCheckedInToday = await ctx.prisma.rsvpCheckIn.count({
				where: {
					submission: { eventId: event.id },
					timestamp: {
						gte: new Date(`${today}T00:00:00.000Z`),
						lt: new Date(`${today}T23:59:59.999Z`),
					},
				},
			});

			return { totalAccepted, totalCheckedInToday };
		}),

	cfpGetForm: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					status: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event) throw hiddenEventNotFound();

			const staff = await isEventStaff(ctx.prisma, event, ctx.userId);
			if (!staff && !PUBLIC_EVENT_STATUSES.includes(event.status)) {
				throw hiddenEventNotFound();
			}

			const cfpForm = await ctx.prisma.cfpForm.findUnique({
				where: { eventId: event.id },
				include: { customQuestions: { orderBy: { order: "asc" } } },
			});

			// Outsiders only see a form the organizer has published.
			if (!staff && !cfpForm?.isPublished) return null;

			return cfpForm;
		}),

	cfpUpdateForm: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				isPublished: z.boolean(),
				allowEdit: z.boolean(),
				anonymiseProposals: z.boolean(),
				hideReviews: z.boolean(),
				onlyWorkshops: z.boolean(),
				onlyTalks: z.boolean(),
				deadline: z.string().nullable().optional(),
				publicCustomResponses: z.boolean(),
				guidelines: z.string().nullable().optional(),
				customQuestions: z.array(
					z.object({
						question: z.string(),
						type: z.string(),
						isMandatory: z.boolean(),
						options: z.string().nullable().optional(),
						description: z.string().nullable().optional(),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage this event.",
					});
				}
			}

			const deadlineDate = input.deadline ? new Date(input.deadline) : null;

			const cfpForm = await ctx.prisma.cfpForm.upsert({
				where: { eventId: event.id },
				update: {
					isPublished: input.isPublished,
					allowEdit: input.allowEdit,
					anonymiseProposals: input.anonymiseProposals,
					hideReviews: input.hideReviews,
					onlyWorkshops: input.onlyWorkshops,
					onlyTalks: input.onlyTalks,
					deadline: deadlineDate,
					publicCustomResponses: input.publicCustomResponses,
					guidelines: sanitizeOptionalRichText(input.guidelines),
				},
				create: {
					eventId: event.id,
					isPublished: input.isPublished,
					allowEdit: input.allowEdit,
					anonymiseProposals: input.anonymiseProposals,
					hideReviews: input.hideReviews,
					onlyWorkshops: input.onlyWorkshops,
					onlyTalks: input.onlyTalks,
					deadline: deadlineDate,
					publicCustomResponses: input.publicCustomResponses,
					guidelines: sanitizeOptionalRichText(input.guidelines),
				},
			});

			// Refresh custom questions
			await ctx.prisma.cfpCustomQuestion.deleteMany({
				where: { cfpFormId: cfpForm.id },
			});

			if (input.customQuestions.length > 0) {
				await ctx.prisma.cfpCustomQuestion.createMany({
					data: input.customQuestions.map((q, index) => ({
						cfpFormId: cfpForm.id,
						question: q.question,
						type: q.type,
						isMandatory: q.isMandatory,
						options: q.options,
						description: q.description,
						order: index,
					})),
				});
			}

			return ctx.prisma.cfpForm.findUnique({
				where: { id: cfpForm.id },
				include: { customQuestions: { orderBy: { order: "asc" } } },
			});
		}),

	cfpGetSubmissions: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR", "VOLUNTEER"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
				}
			}

			const submissions = await ctx.prisma.cfpSubmission.findMany({
				where: { eventId: event.id },
				include: {
					speaker: {
						select: { id: true, name: true, email: true, image: true },
					},
					reviews: { select: { id: true, score: true, reviewerId: true } },
				},
				orderBy: { createdAt: "desc" },
			});

			return submissions;
		}),

	cfpUpdateSubmissionStatus: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				submissionId: z.string(),
				status: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Permission denied.",
					});
				}
			}

			return ctx.prisma.cfpSubmission.update({
				where: { id: input.submissionId, eventId: event.id },
				data: { status: input.status },
			});
		}),

	scheduleGet: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					eventStart: true,
					eventEnd: true,
					showSchedule: true,
					status: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event) throw hiddenEventNotFound();

			const staff = await isEventStaff(ctx.prisma, event, ctx.userId);
			if (!staff && !PUBLIC_EVENT_STATUSES.includes(event.status)) {
				throw hiddenEventNotFound();
			}

			// Speaker emails are for the organizing team only.
			const items = await ctx.prisma.scheduleItem.findMany({
				where: { eventId: event.id },
				include: {
					linkedCfpSubmission: {
						select: {
							id: true,
							title: true,
							sessionType: true,
							speaker: {
								select: { id: true, name: true, email: staff, image: true },
							},
						},
					},
				},
				orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
			});

			// Accepted proposals feed the schedule editor; outsiders get none.
			const acceptedProposals = staff
				? await ctx.prisma.cfpSubmission.findMany({
						where: { eventId: event.id, status: "Accepted" },
						select: {
							id: true,
							title: true,
							sessionType: true,
							abstract: true,
							speaker: {
								select: { id: true, name: true, email: true, image: true },
							},
						},
						orderBy: { title: "asc" },
					})
				: [];

			return {
				event: {
					id: event.id,
					title: event.title,
					slug: event.slug,
					eventStart: event.eventStart,
					eventEnd: event.eventEnd,
					showSchedule: event.showSchedule,
				},
				items,
				acceptedProposals,
			};
		}),

	scheduleSave: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				showSchedule: z.boolean(),
				items: z.array(
					z.object({
						id: z.string().optional(),
						title: z.string(),
						description: z.string().nullable().optional(),
						scheduledDate: z.string(),
						startTime: z.string(),
						endTime: z.string(),
						stage: z.string().nullable().optional(),
						type: z.string().default("talk"),
						speakerName: z.string().nullable().optional(),
						linkedCfpSubmissionId: z.string().nullable().optional(),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit the schedule.",
					});
				}
			}

			// Linked proposals must belong to this event. Checked before any write
			// so a rejected request leaves the existing schedule untouched.
			const linkedIds = [
				...new Set(
					input.items
						.map((item) => item.linkedCfpSubmissionId)
						.filter((id): id is string => Boolean(id)),
				),
			];
			if (linkedIds.length > 0) {
				const ownCount = await ctx.prisma.cfpSubmission.count({
					where: { id: { in: linkedIds }, eventId: event.id },
				});
				if (ownCount !== linkedIds.length) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"A linked proposal in this schedule does not belong to this event.",
					});
				}
			}

			// Update showSchedule on Event
			await ctx.prisma.event.update({
				where: { id: event.id },
				data: { showSchedule: input.showSchedule },
			});

			// Re-sync schedule items
			await ctx.prisma.scheduleItem.deleteMany({
				where: { eventId: event.id },
			});

			if (input.items.length > 0) {
				await ctx.prisma.scheduleItem.createMany({
					data: input.items.map((item) => ({
						eventId: event.id,
						title: item.title,
						description: sanitizeOptionalRichText(item.description),
						scheduledDate: item.scheduledDate,
						startTime: item.startTime,
						endTime: item.endTime,
						stage: item.stage,
						type: item.type,
						speakerName: item.speakerName,
						linkedCfpSubmissionId: item.linkedCfpSubmissionId,
					})),
				});
			}

			return ctx.prisma.scheduleItem.findMany({
				where: { eventId: event.id },
				include: {
					linkedCfpSubmission: {
						select: {
							id: true,
							title: true,
							sessionType: true,
							speaker: {
								select: { id: true, name: true, email: true, image: true },
							},
						},
					},
				},
				orderBy: [{ scheduledDate: "asc" }, { startTime: "asc" }],
			});
		}),

	partnersGet: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					showPartners: true,
					status: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event) throw hiddenEventNotFound();

			if (
				!PUBLIC_EVENT_STATUSES.includes(event.status) &&
				!(await isEventStaff(ctx.prisma, event, ctx.userId))
			) {
				throw hiddenEventNotFound();
			}

			const partners = await ctx.prisma.eventPartner.findMany({
				where: { eventId: event.id },
				orderBy: { order: "asc" },
			});

			return {
				event: {
					id: event.id,
					title: event.title,
					slug: event.slug,
					showPartners: event.showPartners,
				},
				sponsors: partners.filter((p) => p.type === "sponsor"),
				communityPartners: partners.filter((p) => p.type === "community"),
			};
		}),

	partnersSave: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				showPartners: z.boolean(),
				partners: z.array(
					z.object({
						id: z.string().optional(),
						type: z.string(),
						name: z.string(),
						tier: z.string().nullable().optional(),
						customTier: z.string().nullable().optional(),
						logoUrl: imageUrl.nullable().optional(),
						websiteUrl: linkUrl.nullable().optional(),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"You do not have permission to manage partners for this event.",
					});
				}
			}

			// Update showPartners on Event
			await ctx.prisma.event.update({
				where: { id: event.id },
				data: { showPartners: input.showPartners },
			});

			// Re-sync partners
			await ctx.prisma.eventPartner.deleteMany({
				where: { eventId: event.id },
			});

			if (input.partners.length > 0) {
				await ctx.prisma.eventPartner.createMany({
					data: input.partners.map((p, index) => ({
						eventId: event.id,
						type: p.type,
						name: p.name,
						tier: p.tier,
						customTier: p.customTier,
						logoUrl: p.logoUrl,
						websiteUrl: p.websiteUrl,
						order: index,
					})),
				});
			}

			const updated = await ctx.prisma.eventPartner.findMany({
				where: { eventId: event.id },
				orderBy: { order: "asc" },
			});

			return {
				sponsors: updated.filter((p) => p.type === "sponsor"),
				communityPartners: updated.filter((p) => p.type === "community"),
			};
		}),

	volunteersGet: authedProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			// Only what the staff check and default-volunteer seeding below read.
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: {
						select: {
							ownerId: true,
							owner: { select: { name: true, email: true } },
							members: {
								select: { name: true, email: true, role: true, userId: true },
							},
						},
					},
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			// Staff only: this returns team and volunteer contact details and may
			// seed default volunteer rows below.
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
					select: { id: true },
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage this event.",
					});
				}
			}

			let volunteers = await ctx.prisma.eventVolunteer.findMany({
				where: { eventId: event.id },
				include: {
					user: {
						select: {
							id: true,
							name: true,
							username: true,
							email: true,
							image: true,
						},
					},
				},
				orderBy: { createdAt: "asc" },
			});

			// Auto-populate organization owner & members as event volunteers if none exist (FOSS United standard)
			if (volunteers.length === 0) {
				const defaultPeopleToSeed = [
					...(event.organizer.owner
						? [
								{
									name: event.organizer.owner.name || "Organizer Lead",
									email: event.organizer.owner.email,
									role: "Core Organizer",
									userId: event.organizer.ownerId,
								},
							]
						: []),
					...event.organizer.members.map((m) => ({
						name: m.name || m.email.split("@")[0],
						email: m.email,
						role: m.role || "Volunteer",
						userId: m.userId,
					})),
				];

				for (const person of defaultPeopleToSeed) {
					try {
						await ctx.prisma.eventVolunteer.upsert({
							where: {
								eventId_email: {
									eventId: event.id,
									email: person.email,
								},
							},
							create: {
								eventId: event.id,
								name: person.name,
								email: person.email,
								role: person.role,
								userId: person.userId,
							},
							update: {},
						});
					} catch (_err) {
						// Ignore duplicate seeding errors if any
					}
				}

				// Re-query newly seeded volunteers
				volunteers = await ctx.prisma.eventVolunteer.findMany({
					where: { eventId: event.id },
					include: {
						user: {
							select: {
								id: true,
								name: true,
								username: true,
								email: true,
								image: true,
							},
						},
					},
					orderBy: { createdAt: "asc" },
				});
			}

			return {
				event: { id: event.id, title: event.title, slug: event.slug },
				volunteers,
				isOwner: event.organizer.ownerId === ctx.userId,
			};
		}),

	volunteersAdd: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				name: z.string(),
				email: z.string().email(),
				role: z.string().default("Volunteer"),
				customRole: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"You do not have permission to add volunteers to this event.",
					});
				}
			}

			// Invitations email arbitrary addresses: limit per inviting user.
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.inviteUser, identifier: ctx.userId },
			]);

			// Stored against the email only: no account is looked up or linked
			// here, and the response says nothing about whether the address has
			// one. A pending invitation gets a fresh single-use token and expiry
			// (re-inviting replaces the previous link); the invitee accepts it
			// explicitly (services/invites.ts). An accepted member is left linked
			// and only their name/role change.
			const email = input.email.toLowerCase();
			const existing = await ctx.prisma.eventVolunteer.findUnique({
				where: { eventId_email: { eventId: event.id, email } },
				select: { userId: true },
			});
			const invite = existing?.userId ? null : issueInviteToken();

			const volunteer = await ctx.prisma.eventVolunteer.upsert({
				where: { eventId_email: { eventId: event.id, email } },
				update: {
					name: input.name,
					role: input.role,
					customRole: input.customRole,
					...(invite
						? {
								inviteTokenHash: invite.tokenHash,
								inviteExpiresAt: invite.expiresAt,
							}
						: {}),
				},
				create: {
					eventId: event.id,
					email,
					name: input.name,
					role: input.role,
					customRole: input.customRole,
					inviteTokenHash: invite?.tokenHash ?? null,
					inviteExpiresAt: invite?.expiresAt ?? null,
				},
				select: {
					id: true,
					eventId: true,
					name: true,
					email: true,
					role: true,
					customRole: true,
					createdAt: true,
				},
			});

			const appUrl =
				process.env.NEXT_PUBLIC_APP_URL ||
				process.env.APP_URL ||
				"http://localhost:3000";
			sendInviteEmail({
				toEmail: email,
				recipientName: input.name,
				role: input.customRole || input.role || "Volunteer",
				targetName: event.title,
				type: "event",
				...(invite
					? {
							actionUrl: `${appUrl}/invite/${invite.token}`,
							expiresInDays: INVITE_TTL_DAYS,
						}
					: { actionUrl: `${appUrl}/events/${event.slug}` }),
			}).catch((err) =>
				console.error("Failed to send volunteer invite email:", err),
			);

			return volunteer;
		}),

	volunteersUpdate: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				volunteerId: z.string(),
				name: z.string(),
				role: z.string(),
				customRole: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit volunteers.",
					});
				}
			}

			return ctx.prisma.eventVolunteer.update({
				where: { id: input.volunteerId, eventId: event.id },
				data: {
					name: input.name,
					role: input.role,
					customRole: input.customRole,
				},
				include: {
					user: {
						select: {
							id: true,
							name: true,
							username: true,
							email: true,
							image: true,
						},
					},
				},
			});
		}),

	volunteersRemove: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				volunteerId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR", "COORDINATOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to remove volunteers.",
					});
				}
			}

			await ctx.prisma.eventVolunteer.delete({
				where: { id: input.volunteerId, eventId: event.id },
			});

			return { success: true };
		}),

	// ──────────────────────────────────────────────────────────
	// TICKETING SYSTEM: TIERS, BOOKING, DROP, WAITLIST & TRANSFER
	// ──────────────────────────────────────────────────────────

	ticketsGet: publicProcedure
		.input(z.object({ slug: z.string() }))
		.query(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					description: true,
					format: true,
					bannerUrl: true,
					status: true,
					capacity: true,
					eventStart: true,
					eventEnd: true,
					location: true,
					isOnline: true,
					organizerId: true,
					organizer: {
						select: {
							id: true,
							name: true,
							ownerId: true,
							// Used only to build the public team list below; no emails.
							owner: {
								select: {
									id: true,
									name: true,
									image: true,
								},
							},
							members: {
								select: {
									id: true,
									name: true,
									role: true,
									user: { select: { name: true, image: true } },
								},
							},
						},
					},
					volunteers: {
						select: {
							id: true,
							name: true,
							role: true,
							user: { select: { image: true } },
						},
					},
					tickets: {
						orderBy: { order: "asc" },
						include: {
							issuedTickets: {
								select: {
									id: true,
									status: true,
								},
							},
						},
					},
				},
			});

			if (!event) throw hiddenEventNotFound();

			// Staff see drafts (the event page shows them a preview banner) and
			// unpublished tiers (the tickets editor). Everyone else sees public
			// events and published tiers only.
			const staff = await isEventStaff(ctx.prisma, event, ctx.userId);
			if (!staff && !PUBLIC_EVENT_STATUSES.includes(event.status)) {
				throw hiddenEventNotFound();
			}
			const visibleTickets = staff
				? event.tickets
				: event.tickets.filter((t) => t.isPublished);

			// Format tiers with real counts
			const tiers = visibleTickets.map((t) => {
				const confirmedCount = t.issuedTickets.filter(
					(i) => i.status === "CONFIRMED" || i.status === "CHECKED_IN",
				).length;
				const waitlistCount = t.issuedTickets.filter(
					(i) => i.status === "WAITLISTED",
				).length;
				const checkedInCount = t.issuedTickets.filter(
					(i) => i.status === "CHECKED_IN",
				).length;
				const droppedCount = t.issuedTickets.filter(
					(i) => i.status === "DROPPED",
				).length;
				const transferredCount = t.issuedTickets.filter(
					(i) => i.status === "TRANSFERRED",
				).length;

				return {
					id: t.id,
					eventId: t.eventId,
					name: t.name,
					description: t.description,
					price: t.price,
					quantity: t.quantity,
					maxPerOrder: t.maxPerOrder,
					salesStart: t.salesStart,
					salesEnd: t.salesEnd,
					isPublished: t.isPublished,
					allowWaitlist: t.allowWaitlist,
					allowTransfer: t.allowTransfer,
					allowDrop: t.allowDrop,
					order: t.order,
					confirmedCount,
					waitlistCount,
					checkedInCount,
					droppedCount,
					transferredCount,
					isSoldOut: t.quantity !== null && confirmedCount >= t.quantity,
				};
			});

			const totalConfirmed = tiers.reduce(
				(sum, t) => sum + t.confirmedCount,
				0,
			);
			const totalWaitlisted = tiers.reduce(
				(sum, t) => sum + t.waitlistCount,
				0,
			);
			const totalCheckedIn = tiers.reduce(
				(sum, t) => sum + t.checkedInCount,
				0,
			);
			const totalDropped = tiers.reduce((sum, t) => sum + t.droppedCount, 0);

			// Default volunteers to organization owner and team members if no explicit event volunteers are assigned (FOSS United standard)
			const defaultVolunteers = [
				...(event.organizer.owner?.name
					? [
							{
								id: `owner-${event.organizer.owner.id}`,
								name: event.organizer.owner.name,
								role: "Core Organizer",
								user: event.organizer.owner.image
									? { image: event.organizer.owner.image }
									: null,
							},
						]
					: []),
				...event.organizer.members.map((m) => ({
					id: m.id,
					// Never derive a public display name from an email address.
					name: m.name || m.user?.name || "Team member",
					role: m.role || "Volunteer",
					user: m.user?.image ? { image: m.user.image } : null,
				})),
			];

			const effectiveVolunteers =
				event.volunteers.length > 0 ? event.volunteers : defaultVolunteers;

			// Fetch the RSVP form so the public registration page can render
			// organizer-defined custom questions (only when the form is published).
			const rsvpForm = await ctx.prisma.rsvpForm.findUnique({
				where: { eventId: event.id },
				select: {
					isPublished: true,
					description: true,
					customQuestions: {
						orderBy: { order: "asc" },
						select: {
							id: true,
							question: true,
							type: true,
							isMandatory: true,
							options: true,
							description: true,
						},
					},
				},
			});

			// Explicit public shape: no organizer owner/member records and no
			// per-ticket rows (previously spread in via `...event`).
			return {
				event: {
					id: event.id,
					title: event.title,
					slug: event.slug,
					description: event.description,
					format: event.format,
					bannerUrl: event.bannerUrl,
					status: event.status,
					capacity: event.capacity,
					eventStart: event.eventStart,
					eventEnd: event.eventEnd,
					location: event.location,
					isOnline: event.isOnline,
					organizerId: event.organizerId,
					organizer: {
						id: event.organizer.id,
						name: event.organizer.name,
						ownerId: event.organizer.ownerId,
					},
					volunteers: effectiveVolunteers,
				},
				tiers,
				stats: {
					totalConfirmed,
					totalWaitlisted,
					totalCheckedIn,
					totalDropped,
					eventCapacity: event.capacity,
				},
				rsvpForm: rsvpForm?.isPublished ? rsvpForm : null,
			};
		}),

	ticketsManageTiers: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				tiers: z.array(
					z.object({
						id: z.string().optional(),
						name: z.string().min(1, "Tier name is required"),
						description: z.string().nullable().optional(),
						price: z.number().int().min(0).default(0),
						quantity: z.number().int().positive().nullable().optional(),
						maxPerOrder: z.number().int().positive().default(1),
						salesStart: z.string().nullable().optional(),
						salesEnd: z.string().nullable().optional(),
						isPublished: z.boolean().default(true),
						allowWaitlist: z.boolean().default(true),
						allowTransfer: z.boolean().default(true),
						allowDrop: z.boolean().default(true),
						order: z.number().int().default(0),
					}),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					slug: true,
					organizerId: true,
					organizer: { select: { ownerId: true } },
				},
			});
			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.organizer.ownerId !== ctx.userId) {
				const member = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR"] },
					},
				});
				if (!member) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to manage tickets.",
					});
				}
			}

			// Sync tiers
			const incomingIds = input.tiers
				.map((t) => t.id)
				.filter(Boolean) as string[];

			// Delete removed tiers that have 0 issued tickets
			const existingTiers = await ctx.prisma.ticket.findMany({
				where: { eventId: event.id },
				include: { issuedTickets: true },
			});

			// Only tiers that belong to this event may be updated. Previously any id
			// starting with "cm" was updated directly, which could edit another
			// event's tier, and an unrecognised id was silently created as a
			// duplicate.
			const existingIds = new Set(existingTiers.map((tier) => tier.id));
			if (input.tiers.some((t) => t.id && !existingIds.has(t.id))) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"A ticket type in this request no longer exists for this event. Reload the page and try again.",
				});
			}

			for (const existing of existingTiers) {
				if (!incomingIds.includes(existing.id)) {
					if (existing.issuedTickets.length === 0) {
						await ctx.prisma.ticket.delete({ where: { id: existing.id } });
					} else {
						// Soft unpublish if tickets exist
						await ctx.prisma.ticket.update({
							where: { id: existing.id },
							data: { isPublished: false },
						});
					}
				}
			}

			// Upsert incoming tiers
			for (let i = 0; i < input.tiers.length; i++) {
				const t = input.tiers[i];
				const tierData = {
					name: t.name,
					description: t.description || null,
					price: t.price,
					quantity: t.quantity ?? null,
					maxPerOrder: t.maxPerOrder,
					salesStart: t.salesStart ? new Date(t.salesStart) : null,
					salesEnd: t.salesEnd ? new Date(t.salesEnd) : null,
					isPublished: t.isPublished,
					allowWaitlist: t.allowWaitlist,
					allowTransfer: t.allowTransfer,
					allowDrop: t.allowDrop,
					order: i,
				};

				if (t.id) {
					await ctx.prisma.ticket.update({
						where: { id: t.id },
						data: tierData,
					});
				} else {
					await ctx.prisma.ticket.create({
						data: {
							eventId: event.id,
							...tierData,
						},
					});
				}
			}

			return { success: true };
		}),

	ticketBook: publicProcedure
		.input(
			z.object({
				slug: z.string(),
				tierId: z.string(),
				attendeeName: z.string().trim().min(1, "Name is required").max(200),
				attendeeEmail: z.string().email("Invalid email address").max(254),
				attendeePhone: z.string().max(40).optional(),
				answers: z.string().max(20000).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Each booking emails the given address: limit per IP and per address.
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.bookIp, identifier: ctx.clientIp },
				{ rule: RATE_LIMITS.bookEmail, identifier: input.attendeeEmail },
			]);

			const event = await ctx.prisma.event.findUnique({
				where: { slug: input.slug },
				select: {
					id: true,
					title: true,
					status: true,
					eventStart: true,
					location: true,
					registrationStart: true,
					registrationEnd: true,
				},
			});

			if (!event)
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

			if (event.status !== "published") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"This event is currently in draft mode and not accepting registrations. The organizer must publish the event first.",
				});
			}

			const now = new Date();
			if (event.registrationStart && now < event.registrationStart) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Registration for this event has not opened yet.",
				});
			}
			if (event.registrationEnd && now > event.registrationEnd) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Registration for this event has closed.",
				});
			}

			// Hidden (unpublished) tiers cannot be booked, even by id.
			const tier = await ctx.prisma.ticket.findFirst({
				where: { id: input.tierId, eventId: event.id, isPublished: true },
				select: {
					id: true,
					name: true,
					quantity: true,
					allowWaitlist: true,
					salesStart: true,
					salesEnd: true,
				},
			});
			if (!tier)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Ticket tier not found",
				});
			if (tier.salesStart && now < tier.salesStart) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Sales for this ticket have not started yet.",
				});
			}
			if (tier.salesEnd && now > tier.salesEnd) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Sales for this ticket have ended.",
				});
			}

			const attendeeEmail = input.attendeeEmail.trim().toLowerCase();
			const attendeeName = input.attendeeName.trim();
			const access = issueTicketAccessToken();
			const qrToken = generateQrToken();

			// Count-then-insert at SERIALIZABLE isolation: concurrent bookings that
			// would oversell the tier conflict and are retried, so the tier
			// quantity holds exactly. A ticket-code collision is also retried.
			const MAX_ATTEMPTS = 5;
			let issued: {
				ticketCode: string;
				qrToken: string;
				status: "CONFIRMED" | "WAITLISTED";
				waitlistOrder: number | null;
			} | null = null;
			for (let attempt = 1; issued === null; attempt++) {
				try {
					issued = await ctx.prisma.$transaction(
						async (tx) => {
							const existingConfirmed = await tx.issuedTicket.findFirst({
								where: {
									ticketId: tier.id,
									attendeeEmail: { equals: attendeeEmail, mode: "insensitive" },
									status: { in: ["CONFIRMED", "CHECKED_IN"] },
								},
								select: { id: true },
							});
							if (existingConfirmed) {
								throw new TRPCError({
									code: "BAD_REQUEST",
									message: "You already have a confirmed ticket for this tier.",
								});
							}

							const confirmedCount = await tx.issuedTicket.count({
								where: {
									ticketId: tier.id,
									status: { in: ["CONFIRMED", "CHECKED_IN"] },
								},
							});
							const isSoldOut =
								tier.quantity !== null && confirmedCount >= tier.quantity;

							if (isSoldOut && !tier.allowWaitlist) {
								throw new TRPCError({
									code: "BAD_REQUEST",
									message:
										"This ticket tier is sold out and waitlisting is disabled.",
								});
							}

							const waitlistOrder = isSoldOut
								? (await tx.issuedTicket.count({
										where: { ticketId: tier.id, status: "WAITLISTED" },
									})) + 1
								: null;

							const created = await tx.issuedTicket.create({
								data: {
									ticketId: tier.id,
									eventId: event.id,
									userId: ctx.userId ?? null,
									ticketCode: generateTicketCode(),
									qrToken,
									accessTokenHash: access.tokenHash,
									attendeeName,
									attendeeEmail,
									attendeePhone: input.attendeePhone?.trim() || null,
									answers: input.answers || null,
									status: isSoldOut ? "WAITLISTED" : "CONFIRMED",
									waitlistOrder,
								},
								select: {
									ticketCode: true,
									qrToken: true,
									status: true,
									waitlistOrder: true,
								},
							});
							return {
								...created,
								status: created.status as "CONFIRMED" | "WAITLISTED",
							};
						},
						{ isolationLevel: "Serializable" },
					);
				} catch (error) {
					const retryable =
						isSerializationFailure(error) || isUniqueViolation(error);
					if (retryable && attempt < MAX_ATTEMPTS) continue;
					if (retryable) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Registration is busy right now. Please try again.",
						});
					}
					throw error;
				}
			}

			// Only after the booking has committed.
			if (issued.status === "CONFIRMED") {
				sendTicketEmail({
					toEmail: attendeeEmail,
					attendeeName,
					eventTitle: event.title,
					eventStart: event.eventStart,
					location: event.location,
					ticketCode: issued.ticketCode,
					qrToken: issued.qrToken,
					tierName: tier.name,
					accessToken: access.token,
				}).catch((err) =>
					console.error("Ticket email dispatch background error:", err),
				);
			}

			return {
				status: issued.status,
				ticketCode: issued.ticketCode,
				qrToken: issued.qrToken,
				// The booking browser is the holder: it gets the ticket link token.
				accessToken: access.token,
				waitlistOrder: issued.waitlistOrder,
				message:
					issued.status === "CONFIRMED"
						? "Your ticket has been confirmed!"
						: `You are #${issued.waitlistOrder} in the queue on the waitlist.`,
			};
		}),

	participatedList: authedProcedure.query(async ({ ctx }) => {
		// Tickets booked while signed out are matched by email, but only a
		// verified email: otherwise registering with someone else's address
		// would reveal (and grant access to) their tickets.
		const userEmail = await verifiedEmail(ctx.prisma, ctx.userId);

		const include = {
			ticket: {
				select: {
					id: true,
					name: true,
					price: true,
				},
			},
			event: {
				select: {
					id: true,
					title: true,
					slug: true,
					bannerUrl: true,
					format: true,
					eventStart: true,
					eventEnd: true,
					location: true,
					organizer: {
						select: {
							id: true,
							name: true,
							slug: true,
						},
					},
				},
			},
		};

		const [byUser, byEmail] = await Promise.all([
			ctx.prisma.issuedTicket.findMany({
				where: {
					userId: ctx.userId,
					status: { in: ["CONFIRMED", "CHECKED_IN"] },
				},
				include,
			}),
			userEmail
				? ctx.prisma.issuedTicket.findMany({
						where: {
							attendeeEmail: userEmail,
							status: { in: ["CONFIRMED", "CHECKED_IN"] },
						},
						include,
					})
				: Promise.resolve([]),
		]);

		const seen = new Set<string>();
		const result: typeof byUser = [];

		for (const ticket of [...byUser, ...byEmail]) {
			if (!seen.has(ticket.id)) {
				seen.add(ticket.id);
				result.push(ticket);
			}
		}

		return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}),

	/**
	 * A ticket by its link token (the holder's proof) or by its printed code.
	 * Full details (QR token, attendee details, transfer status) only for
	 * someone with full access (see services/tickets.ts); a code alone returns
	 * a minimal card.
	 */
	ticketGet: publicProcedure
		.input(
			z
				.object({
					ticketCode: z.string().max(32).optional(),
					accessToken: z.string().min(40).max(64).optional(),
				})
				.refine((v) => Boolean(v.ticketCode) !== Boolean(v.accessToken), {
					message: "Provide either a ticket code or a ticket link.",
				}),
		)
		.query(async ({ ctx, input }) => {
			// Printed codes are guessable in principle: limit code lookups per IP.
			// Link tokens are 256-bit and need no limit.
			if (input.ticketCode) {
				await enforceRateLimits(ctx.prisma, [
					{ rule: RATE_LIMITS.ticketLookupIp, identifier: ctx.clientIp },
				]);
			}

			const select = {
				id: true,
				ticketCode: true,
				status: true,
				attendeeName: true,
				attendeeEmail: true,
				userId: true,
				accessTokenHash: true,
				checkedInAt: true,
				waitlistOrder: true,
				qrToken: true,
				ticket: {
					select: {
						id: true,
						name: true,
						price: true,
						allowTransfer: true,
						allowDrop: true,
					},
				},
				event: {
					select: {
						id: true,
						title: true,
						slug: true,
						eventStart: true,
						eventEnd: true,
						location: true,
						isOnline: true,
						onlineLink: true,
						organizer: {
							select: {
								id: true,
								name: true,
								slug: true,
								logoUrl: true,
								ownerId: true,
							},
						},
					},
				},
				transfers: {
					where: { status: "PENDING" as const },
					orderBy: { createdAt: "desc" as const },
					take: 1,
					select: { recipientEmail: true, expiresAt: true },
				},
			};
			const ticket = input.accessToken
				? await ctx.prisma.issuedTicket.findUnique({
						where: {
							accessTokenHash: hashTicketAccessToken(input.accessToken),
						},
						select,
					})
				: await ctx.prisma.issuedTicket.findUnique({
						where: { ticketCode: input.ticketCode },
						select,
					});

			if (!ticket) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
			}

			const full = await hasFullTicketAccess(
				ctx.prisma,
				{
					userId: ticket.userId,
					attendeeEmail: ticket.attendeeEmail,
					accessTokenHash: ticket.accessTokenHash,
					organizerOwnerId: ticket.event.organizer.ownerId,
				},
				{ userId: ctx.userId, accessToken: input.accessToken },
			);

			if (!full) {
				return {
					access: "limited" as const,
					ticketCode: ticket.ticketCode,
					status: ticket.status,
					ticket: { name: ticket.ticket.name },
					event: {
						title: ticket.event.title,
						slug: ticket.event.slug,
						eventStart: ticket.event.eventStart,
						eventEnd: ticket.event.eventEnd,
						location: ticket.event.location,
						isOnline: ticket.event.isOnline,
						organizer: { name: ticket.event.organizer.name },
					},
				};
			}

			const {
				userId: _userId,
				accessTokenHash: _accessTokenHash,
				transfers,
				event,
				...details
			} = ticket;
			const { ownerId: _ownerId, ...organizer } = event.organizer;
			return {
				access: "full" as const,
				...details,
				event: { ...event, organizer },
				pendingTransfer: transfers[0] ?? null,
			};
		}),

	/**
	 * Emails the holder a fresh ticket link (the previous link stops working).
	 * Always answers the same way, so it reveals nothing about the ticket or the
	 * address; a per-ticket cooldown limits how often a link is sent.
	 */
	ticketResendLink: publicProcedure
		.input(z.object({ ticketCode: z.string().max(32) }))
		.mutation(async ({ ctx, input }) => {
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.resendLinkIp, identifier: ctx.clientIp },
			]);
			const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
			const now = new Date();
			const ticket = await ctx.prisma.issuedTicket.findUnique({
				where: { ticketCode: input.ticketCode.trim().toUpperCase() },
				select: {
					id: true,
					status: true,
					ticketCode: true,
					qrToken: true,
					attendeeName: true,
					attendeeEmail: true,
					ticket: { select: { name: true } },
					event: { select: { title: true, eventStart: true, location: true } },
				},
			});

			if (
				ticket &&
				(ticket.status === "CONFIRMED" || ticket.status === "CHECKED_IN")
			) {
				const access = issueTicketAccessToken();
				// Atomic cooldown: only one request per window rotates the link.
				const rotated = await ctx.prisma.issuedTicket.updateMany({
					where: {
						id: ticket.id,
						OR: [
							{ accessLinkSentAt: null },
							{
								accessLinkSentAt: {
									lt: new Date(now.getTime() - RESEND_COOLDOWN_MS),
								},
							},
						],
					},
					data: { accessTokenHash: access.tokenHash, accessLinkSentAt: now },
				});
				if (rotated.count === 1) {
					sendTicketEmail({
						toEmail: ticket.attendeeEmail,
						attendeeName: ticket.attendeeName,
						eventTitle: ticket.event.title,
						eventStart: ticket.event.eventStart,
						location: ticket.event.location,
						ticketCode: ticket.ticketCode,
						qrToken: ticket.qrToken,
						tierName: ticket.ticket.name,
						accessToken: access.token,
					}).catch((err) =>
						console.error("Ticket link resend email error:", err),
					);
				}
			}

			return {
				requested: true as const,
				message:
					"If this ticket is active, a link to it has been sent to the attendee's email address.",
			};
		}),

	ticketDrop: publicProcedure
		.input(
			z.object({
				ticketCode: z.string().max(32),
				/** Token from the holder's ticket link, when not signed in as the owner. */
				accessToken: z.string().min(40).max(64).optional(),
				reason: z.string().max(1000).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const ticket = await ctx.prisma.issuedTicket.findUnique({
				where: { ticketCode: input.ticketCode },
				select: {
					id: true,
					ticketId: true,
					status: true,
					userId: true,
					attendeeEmail: true,
					accessTokenHash: true,
					ticket: { select: { allowDrop: true } },
					event: { select: { organizer: { select: { ownerId: true } } } },
				},
			});

			if (!ticket) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
			}

			const allowed = await hasFullTicketAccess(
				ctx.prisma,
				{
					userId: ticket.userId,
					attendeeEmail: ticket.attendeeEmail,
					accessTokenHash: ticket.accessTokenHash,
					organizerOwnerId: ticket.event.organizer.ownerId,
				},
				{ userId: ctx.userId, accessToken: input.accessToken },
			);
			if (!allowed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"To drop this ticket, open it from the link in your ticket email.",
				});
			}

			if (ticket.status !== "CONFIRMED") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot drop ticket with status ${ticket.status}`,
				});
			}

			if (!ticket.ticket.allowDrop) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Ticket dropping is not allowed for this tier.",
				});
			}

			const promoted = await ctx.prisma.$transaction(async (tx) => {
				// Atomic: only a still-confirmed ticket can be dropped once.
				const dropped = await tx.issuedTicket.updateMany({
					where: { id: ticket.id, status: "CONFIRMED" },
					data: { status: "DROPPED" },
				});
				if (dropped.count === 0) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "This ticket is no longer active.",
					});
				}
				// A pending transfer of a dropped ticket must not be claimable.
				await tx.ticketTransfer.updateMany({
					where: { issuedTicketId: ticket.id, status: "PENDING" },
					data: { status: "CANCELLED" },
				});

				const nextWaitlisted = await tx.issuedTicket.findFirst({
					where: { ticketId: ticket.ticketId, status: "WAITLISTED" },
					orderBy: [{ waitlistOrder: "asc" }, { createdAt: "asc" }],
					select: { id: true },
				});
				if (!nextWaitlisted) return null;

				// The promoted attendee gets a fresh ticket link in their email.
				const access = issueTicketAccessToken();
				const promotedTicket = await tx.issuedTicket.update({
					where: { id: nextWaitlisted.id },
					data: {
						status: "CONFIRMED",
						waitlistOrder: null,
						accessTokenHash: access.tokenHash,
					},
					select: {
						attendeeEmail: true,
						attendeeName: true,
						ticketCode: true,
						qrToken: true,
						ticket: { select: { name: true } },
						event: {
							select: { title: true, eventStart: true, location: true },
						},
					},
				});
				return { ticket: promotedTicket, accessToken: access.token };
			});

			// Only after the transaction has committed.
			if (promoted) {
				sendTicketEmail({
					toEmail: promoted.ticket.attendeeEmail,
					attendeeName: promoted.ticket.attendeeName,
					eventTitle: promoted.ticket.event.title,
					eventStart: promoted.ticket.event.eventStart,
					location: promoted.ticket.event.location,
					ticketCode: promoted.ticket.ticketCode,
					qrToken: promoted.ticket.qrToken,
					tierName: promoted.ticket.ticket.name,
					accessToken: promoted.accessToken,
				}).catch((err) =>
					console.error("Promoted waitlist ticket email error:", err),
				);
			}

			return {
				success: true,
				message: promoted
					? "Ticket dropped. The next attendee on the waitlist was automatically promoted to Confirmed!"
					: "Ticket dropped successfully.",
			};
		}),

	ticketTransferInitiate: publicProcedure
		.input(
			z.object({
				ticketCode: z.string().max(32),
				/** Token from the holder's ticket link, when not signed in as the owner. */
				accessToken: z.string().min(40).max(64).optional(),
				recipientName: z
					.string()
					.trim()
					.min(1, "Recipient name is required")
					.max(200),
				recipientEmail: z.string().email("Invalid recipient email").max(254),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await enforceRateLimits(ctx.prisma, [
				{ rule: RATE_LIMITS.transferIp, identifier: ctx.clientIp },
			]);

			const ticket = await ctx.prisma.issuedTicket.findUnique({
				where: { ticketCode: input.ticketCode },
				select: {
					id: true,
					status: true,
					userId: true,
					attendeeName: true,
					attendeeEmail: true,
					accessTokenHash: true,
					ticket: { select: { name: true, allowTransfer: true } },
					event: {
						select: {
							title: true,
							organizer: { select: { ownerId: true } },
						},
					},
				},
			});

			if (!ticket) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
			}

			const allowed = await hasFullTicketAccess(
				ctx.prisma,
				{
					userId: ticket.userId,
					attendeeEmail: ticket.attendeeEmail,
					accessTokenHash: ticket.accessTokenHash,
					organizerOwnerId: ticket.event.organizer.ownerId,
				},
				{ userId: ctx.userId, accessToken: input.accessToken },
			);
			if (!allowed) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"To transfer this ticket, open it from the link in your ticket email.",
				});
			}

			if (ticket.status !== "CONFIRMED") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot transfer ticket with status ${ticket.status}`,
				});
			}

			if (!ticket.ticket.allowTransfer) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Ticket transfer is disabled for this tier.",
				});
			}

			const recipientEmail = input.recipientEmail.trim().toLowerCase();
			if (ticket.attendeeEmail.toLowerCase() === recipientEmail) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot transfer ticket to the same email address.",
				});
			}

			// Valid for 48 hours. The link is emailed to the recipient only; it is
			// never returned to the caller.
			const transferToken = `tr_${randomBytes(24).toString("base64url")}`;
			const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

			await ctx.prisma.$transaction(async (tx) => {
				await tx.ticketTransfer.updateMany({
					where: { issuedTicketId: ticket.id, status: "PENDING" },
					data: { status: "CANCELLED" },
				});
				await tx.ticketTransfer.create({
					data: {
						issuedTicketId: ticket.id,
						senderEmail: ticket.attendeeEmail,
						recipientName: input.recipientName,
						recipientEmail,
						transferToken,
						expiresAt,
						status: "PENDING",
					},
					select: { id: true },
				});
			});

			sendTransferEmail({
				toEmail: recipientEmail,
				recipientName: input.recipientName,
				senderFirstName: ticket.attendeeName.split(" ")[0] || "Someone",
				eventTitle: ticket.event.title,
				tierName: ticket.ticket.name,
				transferToken,
				expiresAt,
			}).catch((err) => console.error("Transfer email dispatch error:", err));

			return { success: true, recipientEmail, expiresAt };
		}),

	ticketTransferGet: publicProcedure
		.input(z.object({ transferToken: z.string().max(100) }))
		.query(async ({ ctx, input }) => {
			const transfer = await ctx.prisma.ticketTransfer.findUnique({
				where: { transferToken: input.transferToken },
				select: {
					status: true,
					expiresAt: true,
					recipientName: true,
					recipientEmail: true,
					issuedTicket: {
						select: {
							attendeeName: true,
							ticket: { select: { name: true } },
							event: {
								select: {
									id: true,
									title: true,
									slug: true,
									eventStart: true,
									eventEnd: true,
									location: true,
									organizer: { select: { name: true, logoUrl: true } },
								},
							},
						},
					},
				},
			});

			if (!transfer) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Transfer invitation not found.",
				});
			}

			// The recipient sees what they are receiving and from whom (first
			// name), not the sender's ticket credentials or contact details.
			const { attendeeName, ...issuedTicket } = transfer.issuedTicket;
			return {
				transfer: {
					status: transfer.status,
					expiresAt: transfer.expiresAt,
					recipientName: transfer.recipientName,
					recipientEmail: transfer.recipientEmail,
					senderName: attendeeName.split(" ")[0] || "Someone",
					issuedTicket,
				},
				isExpired: new Date() > new Date(transfer.expiresAt),
			};
		}),

	ticketTransferClaim: publicProcedure
		.input(
			z.object({
				transferToken: z.string().max(100),
				attendeeName: z.string().trim().min(1, "Name is required").max(200),
				attendeeEmail: z.string().email("Invalid email").max(254),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const transfer = await ctx.prisma.ticketTransfer.findUnique({
				where: { transferToken: input.transferToken },
				select: {
					id: true,
					status: true,
					expiresAt: true,
					recipientEmail: true,
					issuedTicketId: true,
				},
			});

			if (!transfer) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Transfer not found.",
				});
			}

			if (transfer.status !== "PENDING") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Transfer is already ${transfer.status}`,
				});
			}

			if (new Date() > new Date(transfer.expiresAt)) {
				await ctx.prisma.ticketTransfer.updateMany({
					where: { id: transfer.id, status: "PENDING" },
					data: { status: "EXPIRED" },
				});
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This transfer link has expired.",
				});
			}

			const normalizedClaimEmail = input.attendeeEmail.trim().toLowerCase();
			if (
				normalizedClaimEmail !== transfer.recipientEmail.trim().toLowerCase()
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"This transfer was issued for a different email address. Please claim using the address the transfer link was sent to.",
				});
			}

			// Fresh code, QR token and ticket link for the new holder; the previous
			// holder's link and guest check-in cookie stop working.
			const access = issueTicketAccessToken();
			const qrToken = generateQrToken();
			const MAX_ATTEMPTS = 5;
			let claimed: {
				ticketCode: string;
				event: { title: string; eventStart: Date; location: string | null };
				ticket: { name: string };
			} | null = null;
			for (let attempt = 1; claimed === null; attempt++) {
				try {
					claimed = await ctx.prisma.$transaction(async (tx) => {
						// Single use: only a still-pending transfer can be completed.
						const done = await tx.ticketTransfer.updateMany({
							where: { id: transfer.id, status: "PENDING" },
							data: { status: "COMPLETED", completedAt: new Date() },
						});
						if (done.count === 0) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"This transfer has already been completed or cancelled.",
							});
						}

						// The ticket must still be active (not dropped, cancelled or
						// checked in since the transfer was started).
						const ticketCode = generateTicketCode();
						const moved = await tx.issuedTicket.updateMany({
							where: { id: transfer.issuedTicketId, status: "CONFIRMED" },
							data: {
								attendeeName: input.attendeeName,
								attendeeEmail: normalizedClaimEmail,
								attendeePhone: null,
								answers: null,
								ticketCode,
								qrToken,
								accessTokenHash: access.tokenHash,
								accessLinkSentAt: null,
								userId: ctx.userId ?? null,
							},
						});
						if (moved.count === 0) {
							throw new TRPCError({
								code: "BAD_REQUEST",
								message:
									"This ticket is no longer active and cannot be transferred.",
							});
						}

						await tx.guestTicketToken.deleteMany({
							where: { issuedTicketId: transfer.issuedTicketId },
						});

						return tx.issuedTicket.findUniqueOrThrow({
							where: { id: transfer.issuedTicketId },
							select: {
								ticketCode: true,
								event: {
									select: { title: true, eventStart: true, location: true },
								},
								ticket: { select: { name: true } },
							},
						});
					});
				} catch (error) {
					if (isUniqueViolation(error) && attempt < MAX_ATTEMPTS) continue;
					throw error;
				}
			}

			sendTicketEmail({
				toEmail: normalizedClaimEmail,
				attendeeName: input.attendeeName,
				eventTitle: claimed.event.title,
				eventStart: claimed.event.eventStart,
				location: claimed.event.location,
				ticketCode: claimed.ticketCode,
				qrToken,
				tierName: claimed.ticket.name,
				accessToken: access.token,
			}).catch((err) =>
				console.error("Transferred ticket email dispatch error:", err),
			);

			return {
				success: true,
				ticketCode: claimed.ticketCode,
				// The claiming browser is now the holder.
				accessToken: access.token,
				message: "Ticket transfer completed successfully!",
			};
		}),

	ticketVerifyCheckIn: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				codeOrToken: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await assertEventAccess(
				ctx.prisma,
				input.slug,
				ctx.userId,
				["OWNER", "ADMIN", "EDITOR", "COORDINATOR", "VOLUNTEER", "DEVICE"],
			);

			const ticket = await ctx.prisma.issuedTicket.findFirst({
				where: {
					eventId: event.id,
					OR: [
						{ qrToken: input.codeOrToken },
						{ ticketCode: input.codeOrToken },
					],
				},
				include: { ticket: true },
			});

			if (!ticket) {
				return {
					valid: false,
					alreadyCheckedIn: false,
					attendeeName: null,
					ticketCode: null,
					tierName: null,
					checkedInAt: null,
					message: "Ticket not found for this event.",
				};
			}

			const outcome = await checkInIssuedTicket(ctx.prisma, ticket);
			return {
				...outcome,
				attendeeName: ticket.attendeeName,
				ticketCode: ticket.ticketCode,
				tierName: ticket.ticket.name,
			};
		}),

	manageGuestsList: authedProcedure
		.input(
			z.object({
				slug: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const event = await assertEventAccess(
				ctx.prisma,
				input.slug,
				ctx.userId,
				["OWNER", "ADMIN", "EDITOR", "COORDINATOR", "VOLUNTEER"],
			);

			const [issuedTickets, rsvpSubmissions, rsvpForm] = await Promise.all([
				// Explicit select: never return qrToken (it is a check-in credential)
				// to the guest list, which volunteers can also open.
				ctx.prisma.issuedTicket.findMany({
					where: { eventId: event.id },
					select: {
						id: true,
						attendeeName: true,
						attendeeEmail: true,
						attendeePhone: true,
						ticketCode: true,
						status: true,
						answers: true,
						createdAt: true,
						checkedInAt: true,
						ticket: { select: { id: true, name: true, price: true } },
						user: { select: { id: true, name: true, image: true } },
					},
					orderBy: { createdAt: "desc" },
				}),
				ctx.prisma.rsvpSubmission.findMany({
					where: { eventId: event.id },
					include: {
						user: {
							select: { id: true, name: true, email: true, image: true },
						},
						checkIns: { select: { id: true, timestamp: true } },
					},
					orderBy: { createdAt: "desc" },
				}),
				ctx.prisma.rsvpForm.findUnique({
					where: { eventId: event.id },
					include: { customQuestions: { orderBy: { order: "asc" } } },
				}),
			]);

			return {
				event: {
					id: event.id,
					title: event.title,
					slug: event.slug,
					capacity: event.capacity,
				},
				issuedTickets,
				rsvpSubmissions,
				rsvpForm,
			};
		}),

	manageGuestToggleCheckIn: authedProcedure
		.input(
			z.object({
				slug: z.string(),
				guestType: z.enum(["ticket", "rsvp"]),
				id: z.string(),
				action: z.enum(["checkin", "undo"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const event = await assertEventAccess(
				ctx.prisma,
				input.slug,
				ctx.userId,
				["OWNER", "ADMIN", "EDITOR", "COORDINATOR", "VOLUNTEER"],
			);

			if (input.guestType === "ticket") {
				const ticket = await ctx.prisma.issuedTicket.findUnique({
					where: { id: input.id, eventId: event.id },
					select: { id: true, status: true, checkedInAt: true },
				});
				if (!ticket) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Ticket pass not found.",
					});
				}

				if (input.action === "checkin") {
					// Same rules as the scanner: only a CONFIRMED ticket can be checked
					// in. Waitlisted, dropped and cancelled tickets are rejected; an
					// already checked-in ticket is left as-is (original time kept).
					const outcome = await checkInIssuedTicket(ctx.prisma, ticket);
					if (!outcome.valid && !outcome.alreadyCheckedIn) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: outcome.message,
						});
					}
				} else {
					// Undo is only valid for a checked-in ticket. The status condition
					// makes this atomic and stops "undo" from turning a waitlisted,
					// dropped or cancelled ticket into a confirmed one.
					const undone = await ctx.prisma.issuedTicket.updateMany({
						where: { id: ticket.id, status: "CHECKED_IN" },
						data: { status: "CONFIRMED", checkedInAt: null },
					});
					if (undone.count === 0 && ticket.status !== "CONFIRMED") {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Cannot undo check-in for a ticket that is ${ticket.status.toLowerCase()}.`,
						});
					}
				}

				return ctx.prisma.issuedTicket.findUniqueOrThrow({
					where: { id: ticket.id },
					select: { id: true, status: true, checkedInAt: true },
				});
			}

			const submission = await ctx.prisma.rsvpSubmission.findUnique({
				where: { id: input.id, eventId: event.id },
			});
			if (!submission) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "RSVP submission not found.",
				});
			}

			if (input.action === "checkin") {
				const existing = await ctx.prisma.rsvpCheckIn.findFirst({
					where: { submissionId: submission.id },
				});
				if (!existing) {
					await ctx.prisma.rsvpCheckIn.create({
						data: {
							submissionId: submission.id,
						},
					});
				}
			} else {
				await ctx.prisma.rsvpCheckIn.deleteMany({
					where: { submissionId: submission.id },
				});
			}
			return { success: true };
		}),

	// ─────────── Banner Upload ───────────

	bannerUploadUrl: authedProcedure
		.input(
			z.object({
				eventId: z.string(),
				fileType: z.enum([...ALLOWED_MIME_TYPES]),
				fileSize: z.number().max(MAX_BANNER_SIZE),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!supabaseAdmin) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Storage is not configured.",
				});
			}

			// Verify event exists and user has permission
			const event = await ctx.prisma.event.findUnique({
				where: { id: input.eventId },
				include: { organizer: { select: { ownerId: true } } },
			});
			if (!event) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit this event.",
					});
				}
			}

			// Sanitized storage path — no user input in the filename
			const ext =
				input.fileType.split("/")[1] === "jpeg"
					? "jpg"
					: input.fileType.split("/")[1];
			const storagePath = `${input.eventId}/${Date.now()}.${ext}`;

			// Create signed upload URL (expires in 2 minutes)
			const { data, error } = await supabaseAdmin.storage
				.from(BANNER_BUCKET)
				.createSignedUploadUrl(storagePath);

			if (error || !data) {
				console.error("[banner] Creating a signed upload URL failed:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not prepare the upload. Please try again.",
				});
			}

			// Build the public URL for after upload completes
			const { data: publicUrlData } = supabaseAdmin.storage
				.from(BANNER_BUCKET)
				.getPublicUrl(storagePath);

			return {
				signedUrl: data.signedUrl,
				token: data.token,
				storagePath,
				publicUrl: publicUrlData.publicUrl,
			};
		}),

	bannerConfirm: authedProcedure
		.input(
			z.object({
				eventId: z.string(),
				publicUrl: z.string().url(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Verify event exists and user has permission
			const event = await ctx.prisma.event.findUnique({
				where: { id: input.eventId },
				include: { organizer: { select: { ownerId: true } } },
			});
			if (!event) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit this event.",
					});
				}
			}

			// Only a file in this event's own banner folder can be confirmed.
			if (!eventBannerKey(input.publicUrl, event.id)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Upload the banner image through the banner uploader.",
				});
			}

			return ctx.prisma.event.update({
				where: { id: input.eventId },
				data: { bannerUrl: input.publicUrl },
				select: { id: true, bannerUrl: true },
			});
		}),

	bannerDelete: authedProcedure
		.input(z.object({ eventId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!supabaseAdmin) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Storage is not configured.",
				});
			}

			// Verify event exists and user has permission
			const event = await ctx.prisma.event.findUnique({
				where: { id: input.eventId },
				include: { organizer: { select: { ownerId: true } } },
			});
			if (!event) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
			}
			if (event.organizer.ownerId !== ctx.userId) {
				const membership = await ctx.prisma.organizerMember.findFirst({
					where: {
						organizerId: event.organizerId,
						userId: ctx.userId,
						role: { in: ["ADMIN", "EDITOR"] },
					},
				});
				if (!membership) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You do not have permission to edit this event.",
					});
				}
			}

			// Remove the stored file only if the banner URL points inside this
			// event's own folder. A banner set elsewhere (older data) is just
			// cleared below; the service-role client never touches other files.
			const key = eventBannerKey(event.bannerUrl, event.id);
			if (key) {
				const { error } = await supabaseAdmin.storage
					.from(BANNER_BUCKET)
					.remove([key]);
				if (error) {
					// Non-fatal: the banner is still cleared from the event.
					console.error(
						`[banner] Deleting the stored banner for event ${event.id} failed:`,
						error,
					);
				}
			}

			return ctx.prisma.event.update({
				where: { id: input.eventId },
				data: { bannerUrl: null },
				select: { id: true, bannerUrl: true },
			});
		}),
});
