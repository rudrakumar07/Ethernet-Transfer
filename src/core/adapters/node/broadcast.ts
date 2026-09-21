/**
 * IPv4 directed-broadcast computation.
 *
 * Beacons have to reach peers on links that carry no multicast routing - most
 * importantly a direct Ethernet cable, where both ends self-assign a 169.254/16
 * link-local address and there is no gateway to carry a multicast group. On
 * those links the subnet broadcast is the only thing that gets through, so the
 * beacon source needs a real broadcast address per interface address rather
 * than the `broadcast?: string` field that used to be left undefined forever.
 */
export function broadcastAddress(address: string, netmask: string): string | null {
  const addrOctets = parseIpv4(address);
  const maskOctets = parseIpv4(netmask);
  if (!addrOctets || !maskOctets) return null;
  return addrOctets.map((octet, i) => octet | (~maskOctets[i] & 0xff)).join('.');
}

function parseIpv4(value: string): number[] | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}
