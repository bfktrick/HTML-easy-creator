// Which IP addresses the link reader may connect to: only public unicast ones.
// Anything that could reach this computer, the local network or a provider's
// internal services (cloud metadata lives at 169.254.169.254) is refused.

import { isIP } from 'node:net';

type Range = readonly [base: number, prefix: number];

// IANA special-purpose IPv4 registry, plus multicast and the old class E.
const BLOCKED_V4: readonly Range[] = [
  [ipv4('0.0.0.0'), 8], // "this network", including the unspecified address
  [ipv4('10.0.0.0'), 8], // private
  [ipv4('100.64.0.0'), 10], // carrier-grade NAT
  [ipv4('127.0.0.0'), 8], // loopback
  [ipv4('169.254.0.0'), 16], // link-local
  [ipv4('172.16.0.0'), 12], // private
  [ipv4('192.0.0.0'), 24], // IETF protocol assignments
  [ipv4('192.0.2.0'), 24], // documentation
  [ipv4('192.88.99.0'), 24], // old 6to4 relays
  [ipv4('192.168.0.0'), 16], // private
  [ipv4('198.18.0.0'), 15], // benchmarking
  [ipv4('198.51.100.0'), 24], // documentation
  [ipv4('203.0.113.0'), 24], // documentation
  [ipv4('224.0.0.0'), 4], // multicast
  [ipv4('240.0.0.0'), 4], // reserved, including broadcast
];

function ipv4(text: string): number {
  return text.split('.').reduce((value, part) => value * 256 + Number(part), 0);
}

function inRange(value: number, [base, prefix]: Range): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(value / size) === Math.floor(base / size);
}

function isBlockedV4(value: number): boolean {
  return BLOCKED_V4.some((range) => inRange(value, range));
}

/** The eight 16-bit groups of an address that isIP() already accepted as IPv6. */
function ipv6Groups(text: string): number[] {
  let body = text;
  const tail: number[] = [];
  // A dotted IPv4 tail ("::ffff:127.0.0.1") stands for the last two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(body);
  if (dotted) {
    const v4 = ipv4(dotted[1]);
    tail.push(Math.floor(v4 / 65536), v4 % 65536);
    body = body.slice(0, dotted.index);
    if (!body.endsWith('::')) body = body.slice(0, -1);
  }
  const groups = (part: string) => (part === '' ? [] : part.split(':').map((group) => parseInt(group, 16)));
  const halves = body.split('::');
  if (halves.length === 1) return [...groups(body), ...tail];
  const left = groups(halves[0]);
  const right = [...groups(halves[1]), ...tail];
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

function embeddedV4(high: number, low: number): number {
  return high * 65536 + low;
}

function isBlockedV6(g: number[]): boolean {
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  // Forms that carry an IPv4 address are judged by that address: mapped (::ffff:a.b.c.d),
  // translated (::ffff:0:a.b.c.d), compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d).
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (zeros(0, 4) && g[4] === 0xffff && g[5] === 0) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (zeros(0, 6)) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedV4(embeddedV4(g[6], g[7]));
  // 6to4 (2002:a.b.c.d::/48) also tunnels to an IPv4 address.
  if (g[0] === 0x2002) return isBlockedV4(embeddedV4(g[1], g[2]));

  // Only global unicast (2000::/3) is public. That rules out loopback, unique-local
  // (fc00::/7), link-local (fe80::/10), multicast (ff00::/8) and the rest.
  if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // IETF assignments, Teredo, benchmarking
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x3fff && g[1] < 0x1000) return true; // documentation (3fff::/20)
  return false;
}

/**
 * True when the address is not a public unicast address, or not an IP address at all.
 * Accepts IPv6 with brackets or a zone id ("[fe80::1%eth0]").
 */
export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, '');
  const version = isIP(bare);
  if (version === 4) return isBlockedV4(ipv4(bare));
  if (version === 6) return isBlockedV6(ipv6Groups(bare.toLowerCase()));
  return true;
}
