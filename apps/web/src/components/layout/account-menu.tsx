"use client";

import { rovingIndex } from "@/lib/roving-index";
import { Avatar } from "@/components/ui/avatar";
import {
	LayoutDashboard,
	LogOut,
	Search,
	Ticket,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";

export interface AccountMenuUser {
	name: string | null;
	email: string | null;
	image: string | null;
}

export interface AccountMenuProps {
	user: AccountMenuUser;
	dashboardHref: string;
}

const ITEM_CLASS =
	"flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-body text-base text-ink no-underline hover:bg-ink/15 focus-visible:bg-ink/15 focus-visible:-outline-offset-2";

/**
 * Avatar button with an account menu (ARIA menu-button pattern). Arrow keys
 * open it and move between items, Escape closes it and returns focus to the
 * avatar, Tab or a click outside closes it.
 */
export function AccountMenu({
	user,
	dashboardHref,
}: AccountMenuProps): JSX.Element {
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	// Which item to focus once the menu has rendered: "first", or none.
	const focusOnOpen = useRef<boolean>(false);
	const menuId = useId();
	const displayName = user.name || user.email || "your account";

	const items = useCallback(
		(): HTMLElement[] =>
			Array.from(
				menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ??
					[],
			),
		[],
	);

	const close = useCallback((returnFocus: boolean): void => {
		setIsOpen(false);
		if (returnFocus) buttonRef.current?.focus();
	}, []);

	useEffect(() => {
		if (isOpen && focusOnOpen.current) {
			focusOnOpen.current = false;
			items()[0]?.focus();
		}
	}, [isOpen, items]);

	useEffect(() => {
		if (!isOpen) return;
		function handlePointerDown(event: PointerEvent): void {
			const target = event.target;
			if (target instanceof Node && !rootRef.current?.contains(target)) {
				setIsOpen(false);
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [isOpen]);

	function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			focusOnOpen.current = true;
			setIsOpen(true);
			if (isOpen) items()[0]?.focus();
		}
	}

	function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
			return;
		}
		if (event.key === "Tab") {
			close(false);
			return;
		}
		const list = items();
		const current = list.indexOf(document.activeElement as HTMLElement);
		const next = rovingIndex(event.key, Math.max(current, 0), list.length);
		if (next === null) return;
		event.preventDefault();
		// From no focused item, ArrowDown should land on the first one.
		list[current === -1 && event.key === "ArrowDown" ? 0 : next]?.focus();
	}

	return (
		<div ref={rootRef} className="relative">
			<button
				ref={buttonRef}
				type="button"
				aria-haspopup="menu"
				aria-expanded={isOpen}
				aria-controls={isOpen ? menuId : undefined}
				aria-label={`Account menu for ${displayName}`}
				onClick={(event) => {
					// Enter/Space fire a click with detail 0: open and move focus
					// to the first item (menu-button pattern). A pointer click
					// (detail >= 1) just toggles and leaves focus on the avatar.
					if (event.detail === 0 && !isOpen) focusOnOpen.current = true;
					setIsOpen((open) => !open);
				}}
				onKeyDown={handleButtonKeyDown}
				className={`flex size-11 items-center justify-center rounded-full transition-shadow duration-150 hover:ring-3 hover:ring-ink/15 motion-reduce:transition-none ${
					isOpen ? "ring-3 ring-ink/15" : ""
				}`}
			>
				<Avatar
					name={user.name}
					email={user.email}
					image={user.image}
					className="size-11 bg-ink font-display text-sm font-semibold tracking-tight text-paper"
				/>
			</button>

			{isOpen && (
				<div
					ref={menuRef}
					id={menuId}
					role="menu"
					aria-label="Account"
					onKeyDown={handleMenuKeyDown}
					className="absolute top-full right-0 z-20 mt-3 w-70 max-w-[calc(100vw-2rem)] origin-top-right animate-menu-pop rounded-ticket border border-ink/15 bg-paper p-2 shadow-menu motion-reduce:animate-none"
				>
					<div className="mb-2 flex min-w-0 flex-col gap-1 border-b border-perforation p-3">
						<span className="truncate font-display text-base font-medium leading-tight">
							{user.name || "Signed in"}
						</span>
						{user.email && (
							<span className="truncate text-sm text-ink/70">{user.email}</span>
						)}
					</div>
					<Link
						role="menuitem"
						href={dashboardHref}
						className={ITEM_CLASS}
						onClick={() => close(false)}
					>
						<LayoutDashboard
							aria-hidden="true"
							className="size-5 text-ink/70"
						/>
						Dashboard
					</Link>
					{/* Kept from the previous account menu (site-header.tsx). */}
					<Link
						role="menuitem"
						href="/dashboard?tab=tickets"
						className={ITEM_CLASS}
						onClick={() => close(false)}
					>
						<Ticket aria-hidden="true" className="size-5 text-ink/70" />
						My Tickets
					</Link>
					<Link
						role="menuitem"
						href="/profile"
						className={ITEM_CLASS}
						onClick={() => close(false)}
					>
						<UserRound aria-hidden="true" className="size-5 text-ink/70" />
						Profile & Account
					</Link>
					<Link
						role="menuitem"
						href="/events"
						className={ITEM_CLASS}
						onClick={() => close(false)}
					>
						<Search aria-hidden="true" className="size-5 text-ink/70" />
						Browse events
					</Link>
					<hr className="my-2 h-px border-0 bg-perforation" />
					<button
						role="menuitem"
						type="button"
						className={ITEM_CLASS}
						onClick={() => {
							close(false);
							void signOut({ callbackUrl: "/" });
						}}
					>
						<LogOut aria-hidden="true" className="size-5 text-ink/70" />
						Sign out
					</button>
				</div>
			)}
		</div>
	);
}
