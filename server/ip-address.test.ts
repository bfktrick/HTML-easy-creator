import { describe, expect, it } from 'vitest';
import { isBlockedAddress } from './ip-address.ts';

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.10',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.251',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
  ])('blocks IPv4 %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['1.1.1.1', '8.8.8.8', '93.184.215.14', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '192.169.0.1', '198.20.0.1', '223.255.255.255'])(
    'allows public IPv4 %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it.each([
    '::',
    '::1',
    '[::1]',
    'fe80::1',
    'fe80::1%eth0',
    'febf::1',
    'fec0::1',
    'fc00::1',
    'fd12:3456:789a::1',
    'ff02::1',
    '100::1',
    '64:ff9b:1::1',
    '2001::1',
    '2001:2::1',
    '2001:db8::1',
    '3fff::1',
    '5f00::1',
    '1::1',
    '4000::1',
  ])('blocks IPv6 %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4003:80e::200e', '2001:200::1', '3fff:1000::1'])(
    'allows public IPv6 %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it.each([
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::FFFF:10.0.0.1',
    '::ffff:a9fe:a9fe',
    '::ffff:0:192.168.0.1',
    '::127.0.0.1',
    '::7f00:1',
    '::0.0.0.1',
    '64:ff9b::127.0.0.1',
    '64:ff9b::a00:1',
    '2002:7f00:1::1',
    '2002:c0a8:101::1',
  ])('blocks IPv6 forms of internal IPv4 %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::1.1.1.1', '2002:808:808::1'])(
    'allows IPv6 forms of public IPv4 %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it('blocks anything that is not an IP address', () => {
    for (const value of ['', 'localhost', 'example.com', '1.2.3', '1.2.3.256', '::g', '2130706433']) {
      expect(isBlockedAddress(value)).toBe(true);
    }
  });
});
