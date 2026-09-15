import { webcrypto } from 'node:crypto';
import type { CertificateFactory } from '../../ports';

// @peculiar/x509 needs a WebCrypto provider registered. Its public type surface
// doesn't export every WebCrypto interface name, so a few spots below use a
// narrow `unknown` cast rather than fighting the library's typings.
import * as x509 from '@peculiar/x509';
x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0]);

async function toFingerprint(cert: x509.X509Certificate): Promise<string> {
  // SHA-256 fingerprint of the DER certificate, lowercase hex.
  const thumbprint = await cert.getThumbprint('SHA-256');
  return Buffer.from(thumbprint).toString('hex');
}

export function createNodeCertificateFactory(): CertificateFactory {
  return {
    async createSelfSigned(commonName: string) {
      const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
      const keys = (await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      )) as webcrypto.CryptoKeyPair;
      const notAfter = new Date();
      notAfter.setFullYear(notAfter.getFullYear() + 10);

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: `CN=${commonName}`,
        notBefore: new Date(),
        notAfter,
        signingAlgorithm: alg as never,
        keys: keys as never,
        extensions: [],
      });

      const certPem = cert.toString('pem');
      const keyPem = await exportKeyPem(keys.privateKey);
      const fingerprint = await toFingerprint(cert);

      return { certPem, keyPem, fingerprint };
    },

    async fingerprintOf(certPem: string) {
      const cert = new x509.X509Certificate(certPem);
      return toFingerprint(cert);
    },
  };
}

async function exportKeyPem(key: webcrypto.CryptoKey): Promise<string> {
  const exported = await webcrypto.subtle.exportKey('pkcs8', key);
  const b64 = Buffer.from(exported).toString('base64');
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}
