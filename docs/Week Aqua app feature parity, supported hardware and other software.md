# Week Aqua S300 Pro and AquaLamp: pitch plan and research

Nov 2, 2026 · @Stav

A sale to Week Aqua is unlikely, but a barter of one to three lamps is realistic if you fix three things first: add a license and a clean demo to the repo, decide how you describe the decompilation step, and support at least one more lamp family. The official app is rated 2.5 on iOS and 3.4 on Google Play, with repeated complaints about ramps and settings that reset, so a working alternative backed by measurements gives you something concrete to offer. Below: where things stand, how to approach the company, the legal flag, what the official app supports, and what is still missing.

## Where things stand

AquaLamp has strong protocol documentation but almost no traction, and Week Aqua's app has real weaknesses you can pitch against.

**Your repo.** [AquaLamp](https://github.com/bugaXcore/Aqualamp) is a TypeScript monorepo with a web UI, a WebSocket bridge, a Python BLE sidecar, a CLI and a controller library. The [protocol notes](https://github.com/bugaXcore/Aqualamp/blob/main/docs/research/PROTOCOL.md) cover timer and schedule frames, brightness calibration, fade measurements and a firmware-update service you deliberately avoided. The weak points are traction and packaging: 0 stars, 0 forks, no releases, "mobile packaging" still listed as planned, and no LICENSE file in the root listing.

**The company.** Week Aqua is Zhuhai WEEKAQUA Technology Co., Ltd. It develops and sells LED aquarium lighting under its own brands and offers OEM/ODM work. Its [site](https://weekaqua.com/sy) lists Sales@weekaqua.com and +86-0756-3386506.

**Their app.** Version 3.0.28 is rated about 2.5 from 24 iOS ratings and 3.4 from about 414 Google Play reviews, with 10K+ Play downloads. It controls brightness, fan, spectrum modes, custom channels, timers, multi-stage timing, gradients and sunrise/sunset.

**Pain points you can pitch against:**

- UKAPS users reported a [non-functional ramp](https://www.ukaps.org/forum/goto/post?id=699197), a sunrise that works as a few big jumps, and settings that sometimes reset when the app resyncs.
- App Store reviewers say the 3.0 update made things worse and that they can't quickly switch the light on or off for feeding.
- Play reviewers say the only guide is a set of in-app GIFs with Chinese text, and settings can't be exported to a new phone.
- Buyers ask whether the app will [stop working and whether Week Aqua will maintain it](https://ukaps.org/forum/goto/post?id=777523), and whether a PC can control the light. Your PC and browser control answers the last one.
- One UKAPS user got [no reply](https://www.ukaps.org/forum/goto/post?id=788746) from Week Aqua on WhatsApp or Instagram after a lamp failed. Expect slow responses.

## How to approach Week Aqua

Offer a lamp exchange first and keep cash as a bonus. Week Aqua is a manufacturer whose app is a small, Chinese-first side product, and I found no example of a vendor in this niche adopting a community app. Community projects such as the [Chihiros Home Assistant integration](https://github.com/caleb-venner/AquaBle) carry "not affiliated" disclaimers, and the [Fluval Aquasky thread](https://community.home-assistant.io/t/fluval-aquasky-ble-rgb-light/259598) shows the same reverse-engineering pattern. A few lamps cost them little, which makes a barter far more plausible than a purchase.

### Sequence

1. **Make the repo credible first (a few days).**
   - ~~Add a LICENSE~~ (MIT added).
   - Record a 60-second demo: a schedule running with the phone disconnected, and calibrated colors on camera.
   - Tag a v0.1 release.
   - Write a one-page "what works / what's verified" summary.
2. **Build leverage in parallel.** Post in UKAPS and r/PlantedTank, where users are already complaining about the app. A handful of testers and stars changes how the pitch reads.
3. **Contact them in two ways.**
   - Email Sales@weekaqua.com and ask for the software or app team.
   - Message them on Facebook or Instagram as a backup.
   - Try the English-language storefront [weekaqua.world](https://weekaqua.world/collections/week-aqua-s-siries), which lists "WEEK AQUA INTERNATIONAL" S-series B3.0 VER2 products; it may be easier to reach than the factory.
   - Check the app's store listings for the developer's extra contacts (see Other software below).
4. **Make a small ask.** Request 1-3 lamps from different series so you can extend support, plus a "works with Week Aqua" credit. For scale, the S-Series Pro costs about S$93.50 at [Singapore resellers](https://gensou.sg/?p=18432) and about US$96 on [eBay](https://www.ebay.com/itm/116254645071), so three lamps is a few hundred dollars.
5. **Follow up once after about 10 days**, then move on. If they don't answer, release AquaLamp as a proper open-source project and use the traction as a portfolio piece.

### Pitch the right asset

The official app is Java code, so they would not drop in a TypeScript UI. What you bring is the verified protocol spec, the calibration data, the test rig and a reference implementation they can port. Frame it that way.

### Email drafts

Fill in the bracketed parts. Both drafts describe the protocol work as coming from Bluetooth captures and measurements on your own lamp, which is accurate but not the full picture; see the legal section before you send.

**Draft 1: sale or barter**

```markdown
Subject: S300 Pro owner: working open controller (Web Bluetooth) - license or lamp exchange?

Hello Week Aqua team,

I'm [Your name], a developer and S300 Pro owner in Israel. I built AquaLamp, an alternative controller for the S300 Pro (B3.0) that runs in Chrome on Android and on PC, with no cloud account needed.

What it does today:
- Full colour control with measured brightness calibration for red, green and blue (tested against a webcam rig; UV is sent but the webcam can't see it, so UV is not calibrated)
- A 5-slot daily schedule that keeps running on the lamp after the PC disconnects, with a timeline editor
- A documented BLE protocol (frame formats, timing behavior, what is and isn't verified) built from Bluetooth captures, measurements on my own lamp and an interoperability read of the app's frame builder
- A reusable controller library with automated tests, plus a CLI

Demo video: [link]
Code and protocol notes: https://github.com/bugaXcore/Aqualamp

I know from aquarium forums that customers struggle with sunrise ramps and settings that reset in the current app. I think this work could help your app team, and I would like to discuss either:
1) licensing or purchasing the code and documentation, or
2) an exchange: a few lamps from different series (so I can extend support to your other Bluetooth versions) in return for the work and permission to credit it as 'works with Week Aqua'.

Could you tell me who handles app development or partnerships? I'm happy to do a short call or send more detail.

Best regards,
[Your name]
[Contact details]
```

**Draft 2: collaboration first**

```markdown
Subject: Offer to help with the Week Aqua app: protocol notes and a tested controller library

Hello Week Aqua team,

I'm [Your name], a developer who owns an S300 Pro. I wrote an independent controller for it (AquaLamp) and documented its Bluetooth behavior in detail, including timing quirks I measured, such as the roughly 15-second color easing and how stored schedules behave after disconnect.

I'd like to share this with your app developers for free as feedback, and in return ask for two things: a contact on your software team, and one or two lamps from other series so I can test and extend compatibility. If it proves useful, I'm open to a licensing conversation.

Demo: [link]
Repository: https://github.com/bugaXcore/Aqualamp

Would you forward this to the right person?

Thank you,
[Your name]
```

## The legal point to handle first

Your protocol notes say you read the official app's decompiled code with jadx, in addition to the Bluetooth captures and hardware tests, and Week Aqua's engineers will see that. I'm not a lawyer and could not verify Chinese law, so treat this as a flag, not advice.

- **EU:** decompilation is allowed where it is [indispensable for interoperability](https://www.legislation.gov.uk/eudr/2009/24/article/6/data.html) of an independently created program, the information wasn't readily available, and the acts stay limited to the necessary parts. The information can't be used for other goals or passed on except where needed for interoperability. Contract terms contrary to that article are void.
- **Israel:** commentary on the 2007 law describes a Section 24 that permits obtaining information needed to make independently developed software work with the original, subject to conditions ([Bizportal, Hebrew](https://www.bizportal.co.il/general/news/article/133826); [Stanford CIS](https://cyberlaw.stanford.edu/blog/2006/12/copyright-reform-israel)). That commentary was written at the bill stage, so confirm the enacted text.
- **Practical steps:**
  - Don't put decompiled code, or text derived from it, in anything you hand over.
  - Describe the work accurately as interoperability research, and be open about the jadx step if they ask.
  - Consider a one-hour consult with an Israeli IP lawyer before you discuss a sale, because an acquirer will want clean title.
  - To map other lamp families without touching the app's code, ask forum owners to post the BLE names their lamps advertise.

## Feature parity for the S300 Pro (B3.0)

AquaLamp already covers the timer and the 5-slot schedule; the open items for the S300 Pro are presets, the ramp, the fan and polish. Many of the app's headline features belong to other lamp families: the 18 named fish and plant modes, 12 custom modes and 12-segment timing were added for the B9.0 T8 tubes, and 8-segment timing belongs to the B6.0 spotlights and B8.0 pump controller. The B3.0 family gets 6 recommended and 6 custom modes, and your hardware tests found 5 schedule slots, which is probably all its firmware exposes. Status below comes from the repo's README and PROTOCOL.md; I did not see the web UI itself.

| Feature | Official app | AquaLamp status for the S300 Pro |
| --- | --- | --- |
| Basic daily timer | Yes, a sunrise/sunset window | Protocol done in the library; not exposed in the UI or CLI (the UI uses the 5-slot schedule instead) |
| Multi-segment schedule | 8 or 12 segments on other families | Done and verified: 5 slots on the S300 Pro, in the UI, keeps running after a PC disconnect. Phone-tab close and lamp power cut not tested yet |
| Sunrise/sunset ramp | 0, 0.5, 1, 2 and 2.5 h | Partial, library only: codes 0 and 1 verified; codes 2-4 sat at a dim flat floor for 12 minutes; code 5 jumps to bright. The UI's sunrise/sunset strip only places keyframes, it does not set lamp fade codes |
| Named presets | 6 recommended modes; Amazon's S300 Pro listing names Green, Red, Mixed, Gorgeous, Colorful and N-Pharm | Not matched: 12 preset frames found, names unknown, not in the UI (the built-ins in the UI are our own curves) |
| Custom modes | 6 custom modes on B3.0 | Not mapped: our presets are unlimited and stored in the browser; only the playing preset is sent to the lamp, as up to 5 steps |
| Fan control | Yes | Frame sent with no visible or audible effect; the S300 Pro may not have a fan |
| Quick on/off for feeding | A "temporary switch" was added in 3.0.7, but reviewers still complain | Header power icon sends off and on. Not yet checked whether a stored schedule relights the lamp after off |
| Languages | English, Hungarian, Indonesian, Japanese, Russian, Simplified Chinese, Spanish, Thai, Vietnamese | English only |

Your ramp measurements may help Week Aqua. A Play Store reviewer found that 1H or 2H made no visible difference from 0H. Your data differs in detail: code 0 jumps to full within seconds, while codes 2-4 sit at a dim floor for the 12 minutes you watched, so they are not identical to 0H, but no ramp was visible either. A ramp slower than 12 minutes is possible, so the "flat" result may come from the lamp firmware or from a longer ramp, not necessarily the app. Say that when you pitch it, and run a 45-minute-plus observation first.

Other Play reviews point to features worth adding:

- The only user guide is a set of in-app GIFs with Chinese text.
- There is no way to export settings to a new phone.
- Switching between light configuration and time programming immediately changes the light.
- Programs are saved on the lamp and keep running without the phone, which AquaLamp's hardware mode also does.

The Play rating is 3.4 from about 414 reviews; the iOS rating is 2.5 from 24.

## Hardware the official app supports

The app supports eight device series, B1.0 to B9.0 with no B4.0 mentioned, but Week Aqua publishes no compatibility list. This table is rebuilt from the [App Store version history](https://apps.apple.com/us/app/week-aqua/id1536538648) and a [UKAPS forum report](https://www.ukaps.org/forum/threads/week-aqua-users.69160/page-3).

| Code | Controls | Notes |
| --- | --- | --- |
| B1.0 | Early freshwater lights | Version 3.0.13 fixed a settings-screen bug in "Freshwater 1.0" mode |
| B2.0 | Freshwater and marine lights | A UKAPS user reported four welcome-screen modes (B2.0 Primary, B2.0 Advanced Freshwater, B1.0 Early, B2.0 Advanced Marine) and a 24V/36V setup prompt |
| B3.0 | S300 Pro and similar | 6 recommended and 6 custom modes; a VER2 revision exists with more gradual lighting and more schedules |
| B5.0 | Marine lights | Added as a "5.0 Sea light page" in 3.0.16 |
| B6.0 | Spotlights | 3 white presets, 12 custom color temperatures, 8-segment timing, sunrise/sunset |
| B7.0 | Smart power strip | 6 outlets, each with 6 timed segments, plus power display |
| B8.0 | Pump controller | 6 modes (Constant, Tide, Cycle, Surge, Classic, Feed), 24-hour timing, 8 segments |
| B9.0 | T8 tube lights | 18 modes, 12 custom modes, 12 segments, sunrise/sunset up to 2.5 h |

I could not find which B-code goes with Week Aqua's marketing lines (M, P, L, Z, V, A, J, T90). Only the S300 Pro is confirmed as B3.0, from its advertised BLE name `B3.0-S300pro-03`. To fill the gaps without touching the app's code, ask forum owners to post the BLE names their lamps advertise.

## Other software from the company

I found one other app, and no desktop, web or WiFi controller from Week Aqua.

- **JayKay:** a second Bluetooth aquarium-light app on the [App Store](https://apps.apple.com/us/app/jaykay/id6443573595), published by the same developer account (周 段) under the JayKay 涵杰 brand. It last updated in January 2023 and has one 1-star rating. Its privacy policy is hosted on a zhilongtech.com domain, which may point to an outside software contractor; that is my inference, not confirmed.
- **Google Play listing:** it names the developer as 段 周 with sales@weekaqua.com, and also shows a separate support email and phone number. Check the [listing](https://play.google.com/store/apps/details?id=com.weekled.weekaquas&hl=en) for those extra contacts, since a contractor may be a better first contact than sales.
- **Week Aqua's own site** is a sales site; I found no software downloads there.

## Prior art: ha-weekaqua

A community Home Assistant integration for Week Aqua Bluetooth lights already exists: alokauz/ha-weekaqua, with beta releases such as [v0.10.0b3](https://github.com/alokauz/ha-weekaqua/releases/tag/v0.10.0b3). I could not open the repo, so I don't know which series it supports. Read it before you pitch: it shows demand for automation, and its author could be an ally or a competitor.

## What's missing to become the official app

Ten gaps separate AquaLamp from an official app, and the highest-value fixes are a license, a clean demo, and a second lamp family with its protocol documented.

| Gap | Why it matters |
| --- | --- |
| **Only the S300 Pro (B3.0) is covered.** The official app spans series B1.0 to B9.0, including a smart plug, a pump controller and T8 tubes. | An official app must support their whole range, so you need lamps from other series. |
| **One lamp, one firmware, unclear hardware revisions.** B3.0 has a VER2 with more gradual lighting and more schedules. | Test across revisions before claiming compatibility. |
| **Unverified protocol pieces:** the fan frame, a master-brightness command, the `TT` timer byte, fade codes 2-5, sunset fades, UV calibration, and what the `F9` handshake frame does. | Each one is a user-visible feature or a possible bug. |
| **Feature gaps for the S300 Pro:** unnamed presets, custom-mode slots, ramp options up to 2.5 h, fan control, and a check that feeding on/off works without editing the schedule. | Users judge the replacement against the old app's feature list. |
| **No iOS path.** Your phone route is Web Bluetooth on Android Chrome, and iOS Safari doesn't support Web Bluetooth. | The official app supports iOS 13+, so iPhone needs a native or wrapped app. |
| **No native packaging or store presence.** Mobile packaging is still planned. | Official means a store listing, signing, permissions and a privacy policy under their developer account. |
| **No users, no field testing, no maintainer story.** | Companies adopt things that already have an audience. |
| **Licensing and trademark.** There is no LICENSE, and the project uses the Week Aqua name unofficially. | They need clear ownership or a license, and they control branding. |
| **Languages.** The official app ships nine; I could not check your UI's. | An official app needs at least Chinese and English. |
| **Wake and connection behavior.** Your notes say the lamp allows one connection and that waking a sleeping lamp isn't fully solved. | These are the failure modes users will hit first. |

## Limits of this research

The findings rest on public listings and your README and protocol notes. I could not open your repo's `docs` folder listing, the Week Aqua contact page, or the ha-weekaqua repo, because those pages block automated access or were not reachable in this session. I did not read AquaLamp's source code or UI, so feature status is inferred from the README and PROTOCOL.md. Legal points are a flag for a lawyer, not advice.

## Sources

- [AquaLamp repo](https://github.com/bugaXcore/Aqualamp) and [PROTOCOL.md](https://github.com/bugaXcore/Aqualamp/blob/main/docs/research/PROTOCOL.md)
- [Week Aqua company site](https://weekaqua.com/sy) and [Facebook page](https://www.facebook.com/WEEKAQUA/)
- [WEEK AQUA on Google Play](https://play.google.com/store/apps/details?id=com.weekled.weekaquas&hl=en)
- [WEEK AQUA on the App Store, with version history](https://apps.apple.com/us/app/week-aqua/id1536538648)
- [JayKay on the App Store](https://apps.apple.com/us/app/jaykay/id6443573595)
- [Amazon: Week Aqua S300 Pro listing](https://www.amazon.com/S300Pro-Shade-Ver-3-Spectrum-Plant/dp/B0HCZBT7L6)
- [Week Aqua International: S Series B3.0 VER2](https://weekaqua.world/collections/week-aqua-s-siries)
- [UKAPS: Week aqua users](https://www.ukaps.org/forum/threads/week-aqua-users.69160/page-3) and [Week Aqua V series](https://ukaps.org/forum/threads/week-aqua-v-series.76956)
- [ha-weekaqua release v0.10.0b3](https://github.com/alokauz/ha-weekaqua/releases/tag/v0.10.0b3)
- [AquaBle (Chihiros Home Assistant)](https://github.com/caleb-venner/AquaBle) and [Fluval Aquasky BLE thread](https://community.home-assistant.io/t/fluval-aquasky-ble-rgb-light/259598)
- [Gensou S-Series Pro listing](https://gensou.sg/?p=18432) and [eBay S-Series listing](https://www.ebay.com/itm/116254645071)
- [Software Directive 2009/24/EC, Article 6](https://www.legislation.gov.uk/eudr/2009/24/article/6/data.html)
- [Israeli copyright law Section 24 (Bizportal, Hebrew)](https://www.bizportal.co.il/general/news/article/133826) and [Stanford CIS commentary](https://cyberlaw.stanford.edu/blog/2006/12/copyright-reform-israel)
