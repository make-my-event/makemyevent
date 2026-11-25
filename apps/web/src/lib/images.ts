import "server-only";
import sharp from "sharp";

/**
 * Turns an uploaded file into the images we store, or says why it cannot.
 *
 * Nothing the browser sends is trusted: not the file name, not its stated
 * type. The bytes are decoded, and only JPEG, PNG or WebP get through (no
 * SVG, which can carry scripts; no HEIC or TIFF, whose decoders have the
 * worst record). Every image is then re-encoded from its pixels, so a file
 * built to be two things at once comes out as one plain image, and camera
 * data such as location is dropped (sharp writes no metadata unless asked).
 */

/** Under the 4.5 MB body the host (Vercel) accepts, form parts included. */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Refuses decompression bombs: a small file that would unpack to gigabytes. */
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED = new Set(["jpeg", "png", "webp"]);

export class ImageRejected extends Error {}

async function decode(input: Buffer) {
	if (input.byteLength === 0) throw new ImageRejected("That file is empty.");
	if (input.byteLength > UPLOAD_MAX_BYTES)
		throw new ImageRejected("Use an image under 4 MB.");
	const image = sharp(input, {
		limitInputPixels: MAX_INPUT_PIXELS,
		failOn: "error",
		// First frame only, if it is animated.
		pages: 1,
	});
	let format: string | undefined;
	try {
		({ format } = await image.metadata());
	} catch {
		throw new ImageRejected("That file is not an image we can read.");
	}
	if (!format || !ALLOWED.has(format))
		throw new ImageRejected("Use a JPG, PNG or WebP image.");
	// Upright, as the camera meant it, before anything is cropped.
	return image.rotate();
}

export type Poster = { large: Buffer; small: Buffer };

/**
 * A poster: 4:5, like an Instagram portrait post. Anything else is cropped
 * to 4:5 around its most eye-catching part, never stretched.
 */
export async function processPoster(input: Buffer): Promise<Poster> {
	const image = await decode(input);
	const crop = (width: number, height: number) =>
		image
			.clone()
			.resize(width, height, { fit: "cover", position: "attention" })
			.webp({ quality: 82 })
			.toBuffer();
	try {
		const [large, small] = await Promise.all([
			crop(1080, 1350),
			crop(540, 675),
		]);
		return { large, small };
	} catch {
		throw new ImageRejected("That image could not be processed. Try another.");
	}
}

/** A logo: square, 256 px, shown at a fraction of that. */
export async function processLogo(input: Buffer): Promise<Buffer> {
	const image = await decode(input);
	try {
		return await image
			.resize(256, 256, { fit: "cover", position: "centre" })
			.webp({ quality: 88 })
			.toBuffer();
	} catch {
		throw new ImageRejected("That image could not be processed. Try another.");
	}
}

/**
 * An image inside the About text: kept in its own shape, no larger than
 * 1600 px on its longer side (never enlarged).
 */
export async function processInline(input: Buffer): Promise<Buffer> {
	const image = await decode(input);
	try {
		return await image
			.resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
			.webp({ quality: 82 })
			.toBuffer();
	} catch {
		throw new ImageRejected("That image could not be processed. Try another.");
	}
}
