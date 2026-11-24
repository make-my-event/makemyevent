import type { Metadata } from "next";
import { QrPattern } from "@/components/qr-pattern";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CheckInDemo } from "./_landing/check-in-demo";
import { CreateCta } from "./_landing/create-cta";
import { CopyLink } from "./_landing/copy-link";
import { PassDeck, type SamplePass } from "./_landing/pass-deck";
import styles from "./landing.module.css";

export const metadata: Metadata = {
	title: { absolute: "makemyevent — event pages, QR passes and certificates" },
};

const PASSES: SamplePass[] = [
	{
		kind: "Hackathon weekend",
		badge: "Free entry",
		title: "Winter Build",
		date: "Sat, 16 Jan",
		venue: "Open Air Theatre",
		attendee: "Ananya Deshmukh",
		code: "MME-7Q4K-2291",
		seed: 7,
	},
	{
		kind: "College cultural fest",
		badge: "Fest pass",
		title: "Spandan ’27",
		date: "Fri, 12 Feb",
		venue: "Main Quad",
		attendee: "Rohan Kulkarni",
		code: "MME-3F8T-0457",
		seed: 23,
	},
	{
		kind: "Community meetup",
		badge: "Meetup",
		title: "Design Meetup #41",
		date: "Sat, 23 Jan",
		venue: "Baner Co-work Hall",
		attendee: "Tanvi Nair",
		code: "MME-9C2L-1180",
		seed: 61,
	},
];

const COMMUNITIES = [
	{
		title: "College festivals",
		description:
			"One page for the fest, and a QR pass for everyone who registers.",
		rows: [
			{
				day: "12",
				month: "Feb",
				name: "Spandan ’27 cultural fest",
				where: "Main Quad, Sahyadri College of Arts",
				count: "4,200",
				unit: "passes",
			},
			{
				day: "13",
				month: "Feb",
				name: "Battle of the Bands",
				where: "Amphitheatre stage",
				count: "860",
				unit: "passes",
			},
		],
	},
	{
		title: "Community meetups",
		description: "Share one link and see who is coming.",
		rows: [
			{
				day: "23",
				month: "Jan",
				name: "Pune Design Meetup #41",
				where: "Baner Co-work Hall",
				count: "74",
				unit: "going",
			},
		],
	},
	{
		title: "Workshops",
		description: "Track who registered, then send certificates when it ends.",
		rows: [
			{
				day: "30",
				month: "Jan",
				name: "Intro to linocut printing",
				where: "Studio 4, Kala Ghar",
				count: "24",
				unit: "seats",
			},
		],
	},
	{
		title: "Conferences",
		description: "QR check-in keeps the entrance queue moving.",
		rows: [
			{
				day: "06",
				month: "Mar",
				name: "State of Frontend 2027",
				where: "Riverside Convention Hall",
				count: "650",
				unit: "passes",
			},
		],
	},
	{
		title: "Clubs and interest groups",
		description: "A shareable page for each event your club runs.",
		rows: [
			{
				day: "07",
				month: "Feb",
				name: "Sunday Trail Runners",
				where: "Vetal Hill, east gate, 6:00 am",
				count: "38",
				unit: "going",
			},
		],
	},
];

function CalendarIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
			<path d="M3.5 10h17M8 3v4M16 3v4" />
		</svg>
	);
}

export default function LandingPage() {
	return (
		<>
			<a className={styles.skipLink} href="#main">
				Skip to content
			</a>

			<SiteHeader />

			<main id="main">
				{/* Hero */}
				<section className={styles.hero}>
					<div className={`${styles.inner} ${styles.heroGrid}`}>
						<div className={styles.heroCopy}>
							<h1 className={styles.h1}>
								<span>Host the event.</span>
								<span>We handle the tickets.</span>
							</h1>
							<p className={styles.heroSub}>
								Free event pages, QR passes and certificates for your community.
							</p>
							<p className={styles.heroNote}>
								Everything you need to bring people together, from registration
								to the final certificate.
							</p>
							<div className={styles.ctaRow}>
								<CreateCta
									className={`${styles.btn} ${styles.btnPrimary}`}
									label="Create an event"
								/>
								<a
									className={`${styles.btn} ${styles.btnSecondary}`}
									href="#features"
								>
									Explore features
								</a>
							</div>
							<p className={styles.heroTrust}>
								Made for communities, colleges and independent event organisers.
							</p>
						</div>

						<div className={styles.heroArt}>
							<PassDeck passes={PASSES} />
						</div>
					</div>
				</section>

				{/* Who it is for */}
				<section className={styles.trust} aria-label="Who makemyevent is for">
					<div className={`${styles.inner} ${styles.trustRow}`}>
						<p className={styles.trustLead}>
							Built for the people who bring communities together.
						</p>
						<span>College communities</span>
						<span>Clubs and organisations</span>
						<span>Independent organisers</span>
						<span>Workshops and conferences</span>
					</div>
				</section>

				{/* Features */}
				<section className={styles.section} id="features">
					<div className={styles.inner}>
						<div className={styles.sectionHead}>
							<h2 className={styles.h2}>
								Everything your event needs. In one place.
							</h2>
							<p className={styles.lede}>
								From the first registration to the final certificate, manage the
								whole event journey without juggling several tools.
							</p>
						</div>

						<div className={styles.bento}>
							<article className={`${styles.card} ${styles.cardWide}`}>
								<h3 className={styles.h3}>Your event deserves its own page.</h3>
								<p className={styles.desc}>
									Build a shareable page carrying everything an attendee needs
									to know.
								</p>
								<div className={styles.visual}>
									<div className={styles.pagePreview}>
										<div className={styles.pageCover}>
											<strong>
												Winter Build
												<br />
												Weekend
											</strong>
											<small>16 to 17 January 2027, Pune</small>
										</div>
										<div className={styles.pageBody}>
											<div>
												<p className={styles.pageTitle}>Winter Build Weekend</p>
												<p className={styles.pageMeta}>
													<span>Sat, 16 Jan 2027, 10:00&nbsp;am</span>
													<span>
														Open Air Theatre, Deccan Institute of Design
													</span>
												</p>
												<p className={styles.pageAbout}>
													Two days of building, demos and chai with makers from
													across the city. Bring a laptop and an idea.
												</p>
											</div>
											<div className={styles.regBox}>
												<span
													className={`${styles.btn} ${styles.btnPrimary} ${styles.btnCompact}`}
												>
													Register
												</span>
												<p className={styles.seats}>
													<span className={styles.count}>
														212 of 300 seats taken
													</span>
													<span className={styles.bar} aria-hidden="true">
														<i style={{ inlineSize: "71%" }} />
													</span>
												</p>
												<p className={styles.seatsLeft}>
													<svg
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														strokeWidth="1.5"
														strokeLinecap="round"
														aria-hidden="true"
													>
														<circle cx="8" cy="8" r="6.5" />
														<path d="M8 4.75v3.9M8 11.2h.01" />
													</svg>
													88 seats left
												</p>
											</div>
										</div>
									</div>
								</div>
							</article>

							<article className={styles.card}>
								<h3 className={styles.h3}>Every attendee gets a pass.</h3>
								<p className={styles.desc}>
									A unique QR ticket is issued to everyone who registers.
								</p>
								<div className={`${styles.visual} ${styles.visualCentre}`}>
									<div className={styles.miniPass}>
										<div className={styles.miniPassTop}>
											<p className={styles.miniPassName}>Rohan Kulkarni</p>
											<p className={styles.miniPassEvent}>
												Winter Build Weekend
											</p>
										</div>
										<div className={styles.miniPassQr}>
											<QrPattern seed={23} className={styles.qrMedium} />
											<span className={styles.code}>MME-3F8T-0457</span>
											<span className={styles.chip}>
												<svg
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2.5"
													strokeLinecap="round"
													strokeLinejoin="round"
													aria-hidden="true"
												>
													<path d="m5 12.5 4.5 4.5L19 7.5" />
												</svg>
												Verified
											</span>
										</div>
									</div>
								</div>
							</article>

							<article className={styles.card}>
								<h3 className={styles.h3}>Scan. Verify. Welcome.</h3>
								<p className={styles.desc}>
									Check tickets at the entrance from any phone.
								</p>
								<div className={styles.visual}>
									<CheckInDemo />
								</div>
							</article>

							<article className={styles.card}>
								<h3 className={styles.h3}>Recognition, made simple.</h3>
								<p className={styles.desc}>
									Issue certificates to participants once the event is over.
								</p>
								<div className={styles.visual}>
									<div className={styles.certificate}>
										<p className={styles.certKind}>
											Certificate of participation
										</p>
										<p className={styles.certName}>Ananya Deshmukh</p>
										<p className={styles.certFor}>
											for taking part in Winter Build Weekend, 16 to 17 January
											2027
										</p>
										<p className={styles.certFoot}>
											<span>Deccan Makers Club</span>
											<span className={styles.code}>CERT-7Q4K-2291</span>
										</p>
									</div>
								</div>
							</article>

							<article className={styles.card}>
								<h3 className={styles.h3}>Know who is coming.</h3>
								<p className={styles.desc}>
									Registrations and attendee details in one list.
								</p>
								<div className={styles.visual}>
									<div className={styles.regPanel}>
										<p className={styles.regHead}>
											<strong className={styles.count}>212</strong>
											<span>registered, 9 today</span>
										</p>
										<ul className={styles.regList}>
											{[
												{
													initials: "AD",
													name: "Ananya Deshmukh",
													status: "Checked in",
													done: true,
												},
												{
													initials: "RK",
													name: "Rohan Kulkarni",
													status: "Checked in",
													done: true,
												},
												{
													initials: "FS",
													name: "Farhan Shaikh",
													status: "Registered",
													done: false,
												},
												{
													initials: "TN",
													name: "Tanvi Nair",
													status: "Registered",
													done: false,
												},
											].map((row) => (
												<li key={row.name}>
													<span className={styles.avatar} aria-hidden="true">
														{row.initials}
													</span>
													<span className={styles.regName}>{row.name}</span>
													<span
														className={
															row.done ? styles.chip : styles.chipQuiet
														}
													>
														{row.done ? (
															<svg
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2.5"
																strokeLinecap="round"
																strokeLinejoin="round"
																aria-hidden="true"
															>
																<path d="m5 12.5 4.5 4.5L19 7.5" />
															</svg>
														) : null}
														{row.status}
													</span>
												</li>
											))}
										</ul>
									</div>
								</div>
							</article>

							<article
								className={`${styles.card} ${styles.cardFull}`}
								id="pricing"
							>
								<h3 className={styles.h3}>No unnecessary barriers.</h3>
								<p className={styles.desc}>
									Publish an event page and take registrations with no upfront
									fee.
								</p>
								<div className={styles.visual}>
									<p className={styles.price}>
										<span className={styles.priceNum}>
											<sup>₹</sup>0
										</span>
										<span className={styles.priceLine}>
											to publish an event page
										</span>
									</p>
								</div>
							</article>
						</div>
					</div>
				</section>

				{/* How it works */}
				<section
					className={`${styles.section} ${styles.ruleTop}`}
					id="how-it-works"
				>
					<div className={styles.inner}>
						<div className={styles.sectionHead}>
							<h2 className={styles.h2}>From idea to entry in three steps.</h2>
						</div>

						<ol className={styles.steps}>
							<li className={styles.step}>
								<h3 className={styles.h3}>Create your event</h3>
								<p className={styles.desc}>
									Add the details, a cover image, the venue and how people
									register.
								</p>
								<div className={styles.mini} aria-hidden="true">
									<p className={styles.field}>
										<span>Event name</span>Winter Build Weekend
									</p>
									<p className={styles.field}>
										<span>Venue</span>Open Air Theatre
									</p>
									<p className={styles.field}>
										<span>Seats</span>300
									</p>
								</div>
							</li>

							<li className={styles.step}>
								<h3 className={styles.h3}>Share your page</h3>
								<p className={styles.desc}>
									Publish it, then share one link with your community.
								</p>
								<div className={styles.mini}>
									<p className={styles.linkBar}>
										<code className={styles.code} translate="no">
											makemyevent.org/e/winter-build
										</code>
									</p>
									<CopyLink url="makemyevent.org/e/winter-build" />
								</div>
							</li>

							<li className={styles.step}>
								<h3 className={styles.h3}>Welcome your attendees</h3>
								<p className={styles.desc}>
									Everyone gets a QR pass, checked at the door in a second.
								</p>
								<div className={styles.mini} aria-hidden="true">
									<p className={styles.scanResult}>
										<span className={styles.tick}>
											<svg
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.5"
												strokeLinecap="round"
												strokeLinejoin="round"
												aria-hidden="true"
											>
												<path d="m5 12.5 4.5 4.5L19 7.5" />
											</svg>
										</span>
										<span className={styles.scanWho}>
											<strong>Pass verified</strong>
											<small>Farhan Shaikh, MME-9C2L-1180</small>
										</span>
									</p>
									<p className={styles.note}>Each pass is accepted once.</p>
								</div>
							</li>
						</ol>
					</div>
				</section>

				{/* The pass itself */}
				<section className={`${styles.section} ${styles.ruleTop}`} id="pass">
					<div className={`${styles.inner} ${styles.showcase}`}>
						<div>
							<h2 className={styles.h2}>
								Not a registration confirmation. A proper event pass.
							</h2>
							<p className={styles.lede}>
								Every attendee gets a ticket that is easy to find, simple to
								show and quick to verify.
							</p>
							<dl className={styles.anatomy}>
								<div>
									<dt>Event details</dt>
									<dd>Name, date, time and venue, printed on the pass.</dd>
								</div>
								<div>
									<dt>Attendee</dt>
									<dd>The name the person registered with.</dd>
								</div>
								<div>
									<dt>QR code</dt>
									<dd>Scanned at the entrance to check them in.</dd>
								</div>
								<div>
									<dt>Ticket ID</dt>
									<dd>A unique identifier for every pass.</dd>
								</div>
								<div>
									<dt>Status</dt>
									<dd>Whether the pass is still valid or already used.</dd>
								</div>
							</dl>
						</div>

						<article className={styles.ticket}>
							<div className={styles.ticketMain}>
								<p className={styles.ticketTop}>
									<span>makemyevent pass</span>
									<span className={styles.ticketStatus}>
										Valid, not yet scanned
									</span>
								</p>
								<p className={styles.ticketTitle}>Winter Build Weekend</p>
								<p className={styles.ticketOrg}>
									Hosted by the Deccan Makers Club
								</p>
								<dl className={styles.ticketFields}>
									<div>
										<dt>Date</dt>
										<dd>Sat, 16 Jan 2027</dd>
									</div>
									<div>
										<dt>Doors open</dt>
										<dd>10:00&nbsp;am</dd>
									</div>
									<div className={styles.wide}>
										<dt>Venue</dt>
										<dd>Open Air Theatre, Deccan Institute of Design, Pune</dd>
									</div>
									<div>
										<dt>Attendee</dt>
										<dd>Ananya Deshmukh</dd>
									</div>
								</dl>
							</div>

							<div className={styles.tear} aria-hidden="true" />

							<div className={styles.ticketStub}>
								<QrPattern seed={7} className={styles.qrLarge} />
								<p className={styles.stubMeta}>
									<span className={styles.code}>MME-7Q4K-2291</span>
									<span className={styles.stubAdmit}>Admit one</span>
								</p>
							</div>
						</article>
					</div>
				</section>

				{/* Communities */}
				<section
					className={`${styles.section} ${styles.ruleTop}`}
					id="communities"
				>
					<div className={styles.inner}>
						<div className={styles.sectionHead}>
							<h2 className={styles.h2}>
								Built for communities, not just conferences.
							</h2>
							<p className={styles.lede}>
								A college fest, a meetup, a workshop or a large gathering — the
								same tools carry all of them.
							</p>
						</div>

						<div className={styles.kinds}>
							{COMMUNITIES.map((kind) => (
								<article key={kind.title} className={styles.card}>
									<h3 className={styles.h3}>{kind.title}</h3>
									<p className={styles.desc}>{kind.description}</p>
									<ul className={styles.rows}>
										{kind.rows.map((row) => (
											<li key={row.name} className={styles.eventRow}>
												<span className={styles.eventDate} aria-hidden="true">
													<strong>{row.day}</strong>
													<small>{row.month}</small>
												</span>
												<span className={styles.eventInfo}>
													<strong>{row.name}</strong>
													<small>
														<CalendarIcon />
														{row.day} {row.month} · {row.where}
													</small>
												</span>
												<span className={styles.eventCount}>
													<strong className={styles.count}>{row.count}</strong>
													{row.unit}
												</span>
											</li>
										))}
									</ul>
								</article>
							))}
						</div>
					</div>
				</section>

				{/* Closing call to action */}
				<section className={styles.section} id="start">
					<div className={styles.inner}>
						<div className={styles.closing}>
							<div>
								<h2 className={styles.h2}>Your next event starts here.</h2>
								<p className={styles.lede}>
									Create your page, share it with your community, and let
									makemyevent handle the tickets.
								</p>
							</div>
							<div className={styles.closingAction}>
								<CreateCta
									className={`${styles.btn} ${styles.btnPrimary}`}
									label="Create your event"
								/>
								<p className={styles.note}>
									Simple to start. Free event pages.
								</p>
							</div>
						</div>
					</div>
				</section>
			</main>

			<SiteFooter />
		</>
	);
}
