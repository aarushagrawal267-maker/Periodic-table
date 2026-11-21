# Periodica social strategy

Instagram Reels + YouTube Shorts, 3 posts a week. Times are India Standard Time (IST). The schedule lives in `social/calendar.json`; reels are rendered from it automatically.

Site: https://aarushagrawal267-maker.github.io/Periodic-table/

## 1. Goal

Get students to open Periodica and come back. Followers are a means, not the goal. Every post should either teach one memorable thing or pull someone into a game.

What we promote: free, no sign-up, works offline, 3-minute lessons with memory tricks, the drag-and-drop table game, match and quiz modes, In Real Life rounds, the daily challenge (same 12 elements for everyone, with a share button), streaks and XP, the explore table. Accounts are optional.

## 2. Audience

1. **First:** Indian students in classes 8-12 on CBSE, ICSE and state boards. They meet the periodic table in Class 9-10 (atoms, periodic classification, metals and non-metals, carbon) and again in Class 11 (periodic trends).
2. **Within that:** NEET and JEE aspirants (Class 11-12 and droppers). They need periodic trends, exceptions and symbols that don't match names, and they save revision content.
3. **Second:** students worldwide aged about 13-18 who find chemistry facts fun.

Note: Instagram and YouTube both require users to be 13+. Write for teens, not young children. On YouTube, answer "Is this made for kids?" honestly: content aimed at teens is normally **not** "made for kids", but the owner decides.

## 3. Positioning

"The periodic table, as a game you can play in three minutes." Not a coaching institute, not a meme page: a friendly, accurate study buddy that makes one element stick per video and is free to play.

## 4. Voice

- Clear, friendly, a bit witty. Talk like a smart classmate, not a teacher or an ad.
- Lead with the surprising fact, then the reason. Use real numbers (29.8 °C, 3,422 °C) instead of "super hot".
- No cringe: no "OMG", "you won't believe", fake urgency or slang we don't use.
- At most 1-2 emoji per caption, often none. No emoji in the video.
- Indian English spellings where they differ (caesium, aluminium, haemoglobin, practise as a verb).
- Accuracy is the brand. Every fact is checked against `src/data/elements.json` and standard textbooks. If unsure, cut it.

## 5. Content pillars

Follows the brand / educational / community split.

| Pillar | Share | What it is | Format |
|---|---|---|---|
| Wow elements | ~1/3 | One element, one surprising fact, the reason | `element-spotlight` |
| Exam-ready | ~1/3 | Board, NEET and JEE style questions with a one-line why | `quiz` |
| Play along | ~1/3 | Guess games that invite comments and tagging friends | `guess-element` |

Later, when the owner has time, add manual posts: a 15-second screen recording of the drag-and-drop game or the daily challenge, a "beat my daily score" post, and community spotlights (with permission, see section 13).

Syllabus hooks to reuse: Mendeleev and eka-aluminium (gallium), ionic bonding (NaCl), catenation (carbon), rancidity and nitrogen in chip packets, rusting, density, periodic trends, symbols from Latin names (Na, K, Fe, Ag, Au, Hg, W).

## 6. Posting schedule

**Monday, Wednesday and Friday at 7:00 pm IST.**

- Indian students are in school until about 1:30-3:30 pm, and many have coaching or tuition until about 6-7 pm. Phone time peaks roughly 8-10 pm.
- Posting at 7:00 pm puts the reel in front of followers as they get home, so the first hour of engagement (which decides how far it is pushed) builds into the 8-10 pm peak.
- Monday starts the week with a strong fact, Wednesday keeps the rhythm, Friday is a quiz or game before the weekend, when students have time to play.
- Instagram and YouTube go out at the same time. Keep the same time for the first 4 weeks so the data is comparable. After week 4, test 8:00 pm or a Sunday 11:00 am slot against it if reach is flat.
- Exam season (pre-boards in December-January, boards in February-March): lean towards quiz and revision posts.

**Week 1 is previewed by the owner before posting.** From week 2, preview at least the Monday post each week.

## 7. Hook formulas

The first 1-2 seconds must give a reason to stay. On-screen hooks are 40 characters or fewer.

1. **The impossible claim:** "This metal melts in your hand." "Iron floats on this metal."
2. **The superlative:** "The metal with the highest melting point."
3. **The everyday link:** "This metal defines one second."
4. **The challenge:** "Guess the element in 3 clues. Can you get it on clue 1?"
5. **The trap:** "Your home is wired with copper, so copper must be the best conductor... right?"
6. **The textbook callout:** "Clue 1 is straight out of your Class 10 textbook."

Never write a hook the video doesn't pay off. Don't put the answer in the hook, caption or title of a quiz or guess video.

## 8. Caption structure

1. **Hook line**, matching the on-screen hook (this is what shows before "more").
2. **Value:** 2-3 short sentences with the fact, the number, the reason and a syllabus link where it fits. For quizzes and guesses: "Lock in your answer before the reveal" or "Comment your guess", then the why without giving the answer away up top.
3. **CTA:** one line naming a real feature, ending with **"Play free, link in bio."**
4. Hashtags are added after the caption from the entry's `hashtags` field.

YouTube: the title is 90 characters or fewer and ends with `#Shorts`. The description repeats the value, gives the site URL and ends with 2-3 hashtags.

## 9. Hashtags

- **Instagram:** 3-5 per post. Mix 1-2 broad (#chemistry, #science, #physics), 1 subject-specific (#periodictable, #guesstheelement), and 1-2 audience tags (#cbse, #class10, #class11, #neet, #jee). Add an element tag only when it's not ambiguous (#gallium yes, #mercury no).
- **YouTube:** 2-3 at the end of the description, plus `#Shorts` in the title.
- No banned, unrelated or trending-but-irrelevant tags. No hashtag walls. Rotate tags and check in insights which ones bring reach from "hashtags".

## 10. Link in bio

- **Instagram:** one link in the bio, straight to the site homepage. Bio text: "Learn the periodic table by playing. Free, no sign-up, works offline. New reel Mon/Wed/Fri." No link-tree page while there is only one destination.
- **YouTube:** links in Shorts descriptions are not clickable, so add the site to the channel's profile links (shown on the channel page) and write "link on the channel page" in pinned comments. Keep the URL in descriptions anyway for search and copy-paste.
- **Measuring:** the site has no analytics, so use Instagram's "external link taps" (profile insights) and YouTube's channel link clicks. Optional proxy: new accounts created in Firebase per week (only some students sign in).
- Later, a highlight called "Play" with a 3-story walkthrough of the app.

## 11. Comments and DMs

- Reply to every comment in the first hour after posting (that's when replies help reach most), then at least once a day. Aim for replies within 24 hours.
- **Correct answers:** congratulate briefly and add one extra fact. **Wrong answers:** be kind, give the reason, never mock.
- **Corrections from viewers:** check the fact. If we're wrong, thank them, pin the correction, and fix the next post. Accuracy matters more than pride.
- **Questions about chemistry:** answer briefly in the comments. Good questions become future posts (keep a list).
- Pin a comment on each post: for guesses and quizzes "Answer in the video. How many clues did you need?"; for spotlights a bonus fact.
- Keep conversations public and on-topic. Don't ask anyone for personal details, phone numbers or school names. Delete spam, hate and scams; block repeat offenders.

## 12. Metrics: what decides what we do more of

Read per post, 48 hours and 7 days after posting.

| Metric | Why it matters | Healthy start (first month) |
|---|---|---|
| Views / plays | Reach | Trend upwards week on week |
| Watch-through (avg % watched, % viewed vs swiped on YouTube) | The hook and pacing work | Over 60% avg watched on a 15-25 s reel |
| Saves | Revision value | Highest on quiz and exam posts |
| Shares (sends) | The strongest growth signal | Note which posts get sent at all |
| Comments | The play-along works | Guess posts should lead |
| Profile visits | Interest in us, not just the clip | Ratio to views |
| Link taps / site visits | The actual goal | Any steady growth |

Decision rule after 4 weeks: double the format and topic type with the best **shares + saves per 1,000 views** and the best **watch-through**. Cut or rework whatever is in the bottom third on both. Follower count is not a decision metric.

## 13. Weekly review (Sunday, 20 minutes)

1. Fill one row per post in a simple sheet: date, format, element, views, avg % watched, saves, shares, comments, profile visits, link taps (both platforms).
2. Mark the best and worst post of the week and write one sentence on why (hook? element? topic?).
3. Read all comments: add good questions and corrections to the idea list.
4. Check the next week's three calendar entries: facts double-checked, hooks clear, no answer spoilers.
5. Decide one experiment for next week (a new hook formula, a different time, a different CTA). Change one thing at a time.

## 14. Growth tactics that follow platform rules

Do:
- Post consistently on the same days and time.
- Reply to comments, and make video replies to the best ones on Instagram and YouTube.
- Share every reel to Instagram Stories with a poll or quiz sticker ("Guess before you watch").
- Collaborate with real, small study and science creators: Instagram Collab posts or duets of a quiz. Ask politely, and only work with accounts whose content we'd stand behind.
- Run a monthly "Daily challenge week": invite students to share their daily result (the app has a share button) on their stories and tag us. Repost only with permission and never show a student's full name or face without consent.
- Make series ("Symbols that make no sense: Na, K, Fe, W...") so viewers follow for the next part.
- Use YouTube playlists (Element spotlights, Board exam quiz, Guess the element).

Never:
- Buy followers, likes, views or comments. No bots, engagement pods or follow-for-follow.
- Mass-DM, mass-tag, or comment spam on other accounts.
- Use misleading hooks, fake giveaways or copyrighted music, clips or textbook scans we don't have rights to.
- Pretend to be a school, a board (CBSE, NTA) or a teacher.

## 15. Growth outside social media (for the owner)

- **Your own class first:** show it to classmates and your chemistry teacher, and ask for honest feedback.
- **Teachers:** email or speak to a few chemistry teachers and ask if it's useful for their students. If they like it, they can share it in their class or parent WhatsApp groups themselves. Don't join or post in groups you aren't a member of.
- **School:** ask if it can go in a school newsletter, a science club session or the computer lab.
- **Education directories and communities:** submit to free educational tool lists and directories, and share it once (where the rules allow) in student and teacher communities on Reddit or Discord with a short note on what it does.
- **Science fairs and Olympiad prep groups:** demo it as a revision tool.
- **GitHub:** a good README with screenshots, topics like `education` and `periodic-table`, and a link from your GitHub profile.
