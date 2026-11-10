import { getInitials } from "@/lib/initials";
import Image from "next/image";
import type { JSX } from "react";

export interface AvatarProps {
	name: string | null | undefined;
	email?: string | null;
	image?: string | null;
	/** Pixel size of the image; the element's box comes from `className`. */
	size?: number;
	className?: string;
}

/**
 * Round avatar: the user's image if there is one, otherwise their initials.
 * Decorative (alt="" / aria-hidden): the control that contains it carries
 * the accessible name.
 */
export function Avatar({
	name,
	email,
	image,
	size = 44,
	className = "",
}: AvatarProps): JSX.Element {
	const box = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`;

	if (image) {
		return (
			<span className={box}>
				<Image
					src={image}
					alt=""
					width={size}
					height={size}
					unoptimized
					className="size-full object-cover"
				/>
			</span>
		);
	}

	return (
		<span aria-hidden="true" className={box}>
			{getInitials(name, email)}
		</span>
	);
}
