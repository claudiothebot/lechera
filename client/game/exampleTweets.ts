import type { Tweet } from './tweetCanvas';

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Fictional roadside billboards for Cursor Vibe Jam 2026 (vibej.am/2026).
 * Avatars omitted on purpose — `tweetCanvas` draws initials. Clicks open the
 * jam page, not real X statuses.
 */
function jamTweet(
  id: string,
  body: string,
  created_at: string,
  name: string,
  username: string,
): Tweet {
  return {
    id,
    body,
    createdAt: shortDate(created_at),
    url: 'https://vibej.am/2026/',
    author: {
      name,
      handle: `@${username}`,
    },
  };
}

export const EXAMPLE_TWEETS: Tweet[] = [
  jamTweet(
    '1900100100100100101',
    'Just submitted my game to Cursor Vibe Jam 2026 — vibe-coded start to finish, runs in the browser, no install. Wish me luck 🎮 #VibeJam',
    '2026-04-08T14:22:00.000Z',
    'Morgan Vale',
    'morganvibe',
  ),
  jamTweet(
    '1900100100100100102',
    'Browsing #VibeJam entries and the quality is nuts. Half of these look like month-long studio projects… built in a few weeks with AI.',
    '2026-04-09T09:15:00.000Z',
    'Alex Rivera',
    'ariveradev',
  ),
  jamTweet(
    '1900100100100100103',
    'My #VibeJam workflow: me on creative direction and juice, Cursor on the boring Three.js boilerplate. Teamwork makes the dream work.',
    '2026-04-10T18:40:00.000Z',
    'Sam Okonkwo',
    'samcodesweb',
  ),
  jamTweet(
    '1900100100100100104',
    'Real cash prizes for “you + AI ship a new web game” — yeah I entered #VibeJam. Deadline May 1 13:37 UTC, not sleeping that week.',
    '2026-04-11T11:03:00.000Z',
    'Jordan Lee',
    'jordanlplays',
  ),
  jamTweet(
    '1900100100100100105',
    'Added the official jam widget so my playtime counts. Suddenly this feels very real 🔧 #VibeJam',
    '2026-04-12T16:55:00.000Z',
    'Riley Chen',
    'rileybuilds',
  ),
  jamTweet(
    '1900100100100100106',
    'Portal hopping between #VibeJam games is the most fun “indie tour” I’ve done in ages. Webring energy ✨',
    '2026-04-13T20:12:00.000Z',
    'Casey Bloom',
    'caseybloom',
  ),
  jamTweet(
    '1900100100100100107',
    'Rules say 90%+ AI-written code. My git history is basically me arguing with the assistant in the comments #VibeJam',
    '2026-04-14T08:30:00.000Z',
    'Taylor Kim',
    'taylorkim_dev',
  ),
  jamTweet(
    '1900100100100100108',
    'If your first load isn’t basically instant, the jam rules will humble you. Learned that the hard way 😅 #VibeJam',
    '2026-04-15T13:48:00.000Z',
    'Jamie Foster',
    'jamiefostergames',
  ),
  jamTweet(
    '1900100100100100109',
    'Three.js + Cursor + too much coffee = my whole #VibeJam stack. What are you shipping on?',
    '2026-04-16T17:21:00.000Z',
    'Drew Patel',
    'drewpatelweb',
  ),
  jamTweet(
    '1900100100100100110',
    'Shoutout to everyone posting builds with #VibeJam — every clip makes me want to polish one more thing before submit.',
    '2026-04-17T10:05:00.000Z',
    'Sky Müller',
    'skymullergames',
  ),
  jamTweet(
    '1900100100100100111',
    'Not me refreshing the jam site to see if my entry’s play count moved… okay yes it’s me #VibeJam',
    '2026-04-18T22:18:00.000Z',
    'Charlie Wu',
    'charliewu_dev',
  ),
  jamTweet(
    '1900100100100100112',
    'Multiplayer optional but the vibes when you ship netcode with AI assist? Chef’s kiss. #VibeJam',
    '2026-04-19T15:33:00.000Z',
    'River Santos',
    'riversantos',
  ),
];
